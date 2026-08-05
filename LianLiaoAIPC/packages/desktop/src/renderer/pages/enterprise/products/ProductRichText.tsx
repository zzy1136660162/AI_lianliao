import React, { useMemo } from 'react';

import { sanitizeProductDescriptionHtml } from './productDescription';

export type ProductRichTextProps = {
  className?: string;
  fallback: string;
  html?: string;
};

const ProductRichText: React.FC<ProductRichTextProps> = ({ className, fallback, html }) => {
  const sanitizedHtml = useMemo(() => sanitizeProductDescriptionHtml(html), [html]);

  if (!sanitizedHtml) {
    return <div className={className}>{fallback}</div>;
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />;
};

export default ProductRichText;
