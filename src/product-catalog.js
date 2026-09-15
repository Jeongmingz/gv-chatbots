import rawProductCatalog from "../data/product-catalog.json" with { type: "json" };

export function getProductFamilies(brandKey) {
  return rawProductCatalog[String(brandKey || "").toLowerCase()] || [];
}

export function getProductFamily(brandKey, productFamilyId) {
  return getProductFamilies(brandKey).find((item) => item.id === productFamilyId) || null;
}

export function extractProductFamilyFromPayload(payload, brandKey) {
  const extra = payload?.action?.clientExtra || {};
  if (extra.brand && extra.brand !== brandKey) return null;
  return getProductFamily(brandKey, extra.productFamilyId);
}

export function getProductFamilyFaqs(data, productFamily, limit = 5) {
  if (!productFamily) return [];

  const categories = new Set(productFamily.categoryIds || []);
  const terms = (productFamily.questionTerms || []).map((term) =>
    String(term).toLowerCase()
  );

  return data.flatFaqs
    .filter((faq) => categories.has(faq.categoryId))
    .filter((faq) => {
      if (!terms.length) return true;
      const question = String(faq.question || "").toLowerCase();
      return terms.some((term) => question.includes(term));
    })
    .slice(0, limit);
}
