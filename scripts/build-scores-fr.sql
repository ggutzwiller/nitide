-- Build step 1/2 — extract the FR scores subset, sorted by numeric EAN, to CSV.
-- Input: ./openfoodfacts-products.jsonl (the OFF dump, gitignored, ~72 GB).
-- Output: ./scripts/off-scores-fr.csv (gitignored), columns: code,n,g,v (no header).
-- Run via `pnpm dataset:build`, which then packs the CSV into the binary.
COPY (
  SELECT
    code,
    CASE WHEN lower(nutriscore_grade) IN ('a','b','c','d','e')
         THEN lower(nutriscore_grade) END AS n,
    CASE WHEN lower(coalesce(environmental_score_grade, ecoscore_grade)) IN ('a','b','c','d','e')
         THEN lower(coalesce(environmental_score_grade, ecoscore_grade)) END AS g,
    CASE WHEN TRY_CAST(nova_group AS INTEGER) BETWEEN 1 AND 4
         THEN TRY_CAST(nova_group AS INTEGER) END AS v
  FROM read_ndjson(
    'openfoodfacts-products.jsonl',
    columns = {
      code: 'VARCHAR',
      nutriscore_grade: 'VARCHAR',
      environmental_score_grade: 'VARCHAR',
      ecoscore_grade: 'VARCHAR',
      nova_group: 'VARCHAR',
      countries_tags: 'VARCHAR[]'
    },
    ignore_errors = true,
    maximum_object_size = 67108864
  )
  WHERE code SIMILAR TO '\d{8,14}'
    AND list_contains(countries_tags, 'en:france')
    AND (
      lower(nutriscore_grade) IN ('a','b','c','d','e')
      OR lower(coalesce(environmental_score_grade, ecoscore_grade)) IN ('a','b','c','d','e')
      OR TRY_CAST(nova_group AS INTEGER) BETWEEN 1 AND 4
    )
  ORDER BY CAST(code AS HUGEINT)
) TO 'scripts/off-scores-fr.csv' (HEADER false);
