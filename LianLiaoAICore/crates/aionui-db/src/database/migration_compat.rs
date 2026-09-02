use sha2::{Digest, Sha384};
use sqlx::Connection;

use super::DB_MIGRATOR;
use crate::error::DbError;

// These migrations existed before SQL files were forced to LF at checkout.
// Later migrations were created under the LF policy and must not be included
// without evidence that a CRLF variant was actually shipped.
const LINE_ENDING_COMPAT_VERSION_RANGE: std::ops::RangeInclusive<i64> = 2..=24;

/// Reconcile an applied migration only when its checksum is the exact SHA-384
/// of the embedded SQL after a mechanical CRLF/LF conversion.
///
/// This is bidirectional because supported local Windows builds can embed CRLF
/// while formal release builds embed LF. Description, success state, version,
/// and the alternative checksum must all match before the row is updated.
pub(super) async fn align_known_migration_line_ending_checksum(
    conn: &mut sqlx::SqliteConnection,
    version: i64,
) -> Result<bool, DbError> {
    if !LINE_ENDING_COMPAT_VERSION_RANGE.contains(&version) {
        return Ok(false);
    }

    let Some(migration) = DB_MIGRATOR.iter().find(|migration| migration.version == version) else {
        return Ok(false);
    };
    let Some(alternative_checksum) = alternative_line_ending_checksum(migration.sql.as_ref()) else {
        return Ok(false);
    };

    let row: Option<(String, bool, Vec<u8>)> =
        sqlx::query_as("SELECT description, success, checksum FROM _sqlx_migrations WHERE version = ?")
            .bind(version)
            .fetch_optional(&mut *conn)
            .await
            .map_err(DbError::Query)?;
    let Some((description, success, stored_checksum)) = row else {
        return Ok(false);
    };
    if !success || description != migration.description.as_ref() || stored_checksum.as_slice() != alternative_checksum {
        return Ok(false);
    }

    let mut transaction = conn.begin().await.map_err(DbError::Query)?;
    let updated = sqlx::query(
        "UPDATE _sqlx_migrations SET checksum = ? \
         WHERE version = ? AND description = ? AND success = TRUE AND checksum = ?",
    )
    .bind(migration.checksum.as_ref())
    .bind(version)
    .bind(migration.description.as_ref())
    .bind(alternative_checksum.as_slice())
    .execute(&mut *transaction)
    .await
    .map_err(DbError::Query)?;
    if updated.rows_affected() != 1 {
        transaction.rollback().await.map_err(DbError::Query)?;
        return Ok(false);
    }
    transaction.commit().await.map_err(DbError::Query)?;
    Ok(true)
}

fn alternative_line_ending_checksum(sql: &str) -> Option<[u8; 48]> {
    let alternative_sql = if sql.contains("\r\n") {
        let normalized = sql.replace("\r\n", "\n");
        if normalized.contains('\r') {
            return None;
        }
        normalized
    } else if sql.contains('\n') && !sql.contains('\r') {
        sql.replace('\n', "\r\n")
    } else {
        return None;
    };

    Some(Sha384::digest(alternative_sql.as_bytes()).into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIGRATION_2_CRLF_CHECKSUM: [u8; 48] = [
        0x52, 0x0e, 0x39, 0x8d, 0x27, 0xbc, 0xcd, 0xdd, 0x27, 0xbc, 0x98, 0xb2, 0xe9, 0x0b, 0x1f, 0xbf, 0x90, 0x34,
        0x75, 0x7a, 0x41, 0xb1, 0x28, 0x93, 0xac, 0xf5, 0x1e, 0xc4, 0x00, 0xfd, 0xef, 0xaa, 0xd8, 0x8e, 0x76, 0x9a,
        0x08, 0xd1, 0x15, 0xf8, 0x35, 0x8f, 0xdf, 0xc3, 0x31, 0xa0, 0xc4, 0x44,
    ];
    const MIGRATION_2_LF_CHECKSUM: [u8; 48] = [
        0x5b, 0xae, 0x9a, 0xa1, 0xd0, 0xdf, 0x23, 0x69, 0xcb, 0x60, 0xcf, 0x28, 0xc9, 0x3d, 0x1f, 0xdd, 0x84, 0x6c,
        0x06, 0x02, 0xb3, 0xbf, 0x37, 0x70, 0x24, 0x66, 0x46, 0xf6, 0xb4, 0xe1, 0xf3, 0xe5, 0x07, 0x0e, 0x70, 0x4b,
        0x0b, 0xc2, 0x8e, 0xef, 0x2a, 0xb8, 0x8e, 0x3b, 0xb8, 0x9d, 0x4e, 0x49,
    ];

    async fn connection_with_migration_checksum(
        version: i64,
        checksum: &[u8],
        description: &str,
        success: bool,
    ) -> sqlx::SqliteConnection {
        let mut conn = sqlx::SqliteConnection::connect("sqlite::memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE _sqlx_migrations (\
                version BIGINT PRIMARY KEY, description TEXT NOT NULL, \
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, \
                success BOOLEAN NOT NULL, checksum BLOB NOT NULL, execution_time BIGINT NOT NULL)",
        )
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO _sqlx_migrations \
             (version, description, success, checksum, execution_time) VALUES (?, ?, ?, ?, 0)",
        )
        .bind(version)
        .bind(description)
        .bind(success)
        .bind(checksum)
        .execute(&mut conn)
        .await
        .unwrap();
        conn
    }

    #[test]
    fn migration_2_matches_the_two_observed_line_ending_checksums() {
        let migration = DB_MIGRATOR.iter().find(|migration| migration.version == 2).unwrap();
        let embedded = migration.checksum.as_ref();
        let alternative = alternative_line_ending_checksum(migration.sql.as_ref()).unwrap();
        assert!(
            (embedded == MIGRATION_2_LF_CHECKSUM && alternative == MIGRATION_2_CRLF_CHECKSUM)
                || (embedded == MIGRATION_2_CRLF_CHECKSUM && alternative == MIGRATION_2_LF_CHECKSUM)
        );
    }

    #[tokio::test]
    async fn line_ending_checksums_are_reconciled_for_every_shipped_version() {
        for migration in DB_MIGRATOR
            .iter()
            .filter(|migration| LINE_ENDING_COMPAT_VERSION_RANGE.contains(&migration.version))
        {
            let alternative = alternative_line_ending_checksum(migration.sql.as_ref()).unwrap();
            let mut conn = connection_with_migration_checksum(
                migration.version,
                &alternative,
                migration.description.as_ref(),
                true,
            )
            .await;

            assert!(
                align_known_migration_line_ending_checksum(&mut conn, migration.version)
                    .await
                    .unwrap(),
                "migration {} should reconcile",
                migration.version
            );
            let stored: Vec<u8> = sqlx::query_scalar("SELECT checksum FROM _sqlx_migrations WHERE version = ?")
                .bind(migration.version)
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(stored, migration.checksum.as_ref());
        }
    }

    #[tokio::test]
    async fn unknown_checksum_is_not_reconciled() {
        let migration = DB_MIGRATOR.iter().find(|migration| migration.version == 2).unwrap();
        let unknown = [0x5a; 48];
        let mut conn = connection_with_migration_checksum(2, &unknown, migration.description.as_ref(), true).await;

        assert!(!align_known_migration_line_ending_checksum(&mut conn, 2).await.unwrap());
    }

    #[tokio::test]
    async fn invalid_row_or_unshipped_version_is_not_reconciled() {
        let migration = DB_MIGRATOR.iter().find(|migration| migration.version == 2).unwrap();
        let alternative = alternative_line_ending_checksum(migration.sql.as_ref()).unwrap();

        let mut wrong_description =
            connection_with_migration_checksum(2, &alternative, "modified migration", true).await;
        assert!(
            !align_known_migration_line_ending_checksum(&mut wrong_description, 2)
                .await
                .unwrap()
        );

        let mut failed =
            connection_with_migration_checksum(2, &alternative, migration.description.as_ref(), false).await;
        assert!(
            !align_known_migration_line_ending_checksum(&mut failed, 2)
                .await
                .unwrap()
        );

        let migration_25 = DB_MIGRATOR.iter().find(|migration| migration.version == 25).unwrap();
        let alternative_25 = alternative_line_ending_checksum(migration_25.sql.as_ref()).unwrap();
        let mut unshipped =
            connection_with_migration_checksum(25, &alternative_25, migration_25.description.as_ref(), true).await;
        assert!(
            !align_known_migration_line_ending_checksum(&mut unshipped, 25)
                .await
                .unwrap()
        );
    }
}
