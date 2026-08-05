import { areaList } from '@vant/area-data';
import { Form, Select } from 'antd';
import React, { useMemo } from 'react';

type AreaOption = {
  label: string;
  value: string;
};

export type LiaoningAreaValue = {
  city?: string;
  district?: string;
};

export type LiaoningAreaFieldsProps = LiaoningAreaValue & {
  cityLabel: string;
  cityPlaceholder: string;
  districtLabel: string;
  districtPlaceholder: string;
  onChange: (value: LiaoningAreaValue) => void;
};

const LIAONING_CODE_PREFIX = '21';
const CITY_PARENT_CODE_LENGTH = 4;

/** City options are restricted to Liaoning while query values remain backend-compatible Chinese names. */
export const LIAONING_CITY_OPTIONS: AreaOption[] = Object.entries(areaList.city_list)
  .filter(([code]) => code.startsWith(LIAONING_CODE_PREFIX))
  .map(([code, name]) => ({ label: name, value: code }));

/** Returns districts belonging to one Liaoning city code. */
export const getLiaoningDistrictOptions = (cityCode: string | undefined): AreaOption[] => {
  if (!cityCode || !LIAONING_CITY_OPTIONS.some((option) => option.value === cityCode)) return [];
  const cityPrefix = cityCode.slice(0, CITY_PARENT_CODE_LENGTH);
  return Object.entries(areaList.county_list)
    .filter(([code]) => code.startsWith(cityPrefix))
    .map(([code, name]) => ({ label: name, value: code }));
};

const findOptionByLabel = (options: readonly AreaOption[], label: string | undefined): AreaOption | undefined =>
  options.find((option) => option.label === label);

/** Removes legacy free-text values that are not present in the current Liaoning administrative dataset. */
export const normalizeLiaoningAreaValue = (
  city: string | undefined,
  district: string | undefined
): LiaoningAreaValue => {
  const cityOption = findOptionByLabel(LIAONING_CITY_OPTIONS, city);
  if (!cityOption) return {};
  const districtOption = findOptionByLabel(getLiaoningDistrictOptions(cityOption.value), district);
  return {
    city: cityOption.label,
    district: districtOption?.label,
  };
};

const LiaoningAreaFields: React.FC<LiaoningAreaFieldsProps> = ({
  city,
  district,
  cityLabel,
  cityPlaceholder,
  districtLabel,
  districtPlaceholder,
  onChange,
}) => {
  const cityCode = useMemo(() => findOptionByLabel(LIAONING_CITY_OPTIONS, city)?.value, [city]);
  const districtOptions = useMemo(() => getLiaoningDistrictOptions(cityCode), [cityCode]);

  return (
    <>
      <Form.Item label={cityLabel}>
        <Select
          value={cityCode}
          allowClear
          showSearch
          optionFilterProp='label'
          virtual={false}
          placeholder={cityPlaceholder}
          options={LIAONING_CITY_OPTIONS}
          onChange={(nextCityCode?: string) => {
            const nextCity = LIAONING_CITY_OPTIONS.find((option) => option.value === nextCityCode);
            onChange({ city: nextCity?.label, district: undefined });
          }}
        />
      </Form.Item>
      <Form.Item label={districtLabel}>
        <Select
          value={findOptionByLabel(districtOptions, district)?.value}
          allowClear
          showSearch
          optionFilterProp='label'
          virtual={false}
          disabled={!cityCode}
          placeholder={districtPlaceholder}
          options={districtOptions}
          onChange={(nextDistrictCode?: string) => {
            const nextDistrict = districtOptions.find((option) => option.value === nextDistrictCode);
            onChange({ city, district: nextDistrict?.label });
          }}
        />
      </Form.Item>
    </>
  );
};

export default LiaoningAreaFields;
