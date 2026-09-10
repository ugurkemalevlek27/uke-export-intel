import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTradeFilters, buildTradeConditions, filtersToQuery, activeFilterCount } from "../src/lib/filters";

test("gecersiz tarih sessizce yok sayilir (sorguyu bozmaz)", () => {
  const f = parseTradeFilters({ dateFrom: "01/02/2024", dateTo: "2024-13-45" });
  assert.equal(f.dateFrom, undefined);
  assert.equal(f.dateTo, undefined);
});

test("gecerli tarih kabul edilir", () => {
  const f = parseTradeFilters({ dateFrom: "2024-01-03", dateTo: "2024-07-31" });
  assert.equal(f.dateFrom, "2024-01-03");
  assert.equal(f.dateTo, "2024-07-31");
});

test("sayisal olmayan project id yok sayilir", () => {
  assert.equal(parseTradeFilters({ project: "abc" }).projectId, undefined);
  assert.equal(parseTradeFilters({ project: "12" }).projectId, 12);
  assert.equal(parseTradeFilters({ project: "1; DROP TABLE" }).projectId, undefined);
});

test("HS parcalari rakama indirgenip kirpilir", () => {
  assert.equal(parseTradeFilters({ hs4: "3208.90" }).hs4, "3208");
  assert.equal(parseTradeFilters({ hs6: "320890910029" }).hs6, "320890");
  assert.equal(parseTradeFilters({ hs4: "32" }).hs4, undefined); // yetersiz uzunluk
});

test("bos string filtre sayilmaz", () => {
  const f = parseTradeFilters({ importerCountry: "   ", exporter: "" });
  assert.equal(f.importerCountry, undefined);
  assert.equal(f.exporter, undefined);
  assert.equal(activeFilterCount(f), 0);
});

test("buildTradeConditions HER ZAMAN organizationId kosulunu icerir", () => {
  // Hicbir filtre verilmese bile en az bir kosul (organization_id) uretilmeli.
  const bos = buildTradeConditions(7, {});
  assert.equal(bos.length, 1);

  // Filtre eklendikce kosul sayisi artar ama org kosulu hep kalir.
  const dolu = buildTradeConditions(7, {
    projectId: 3,
    importerCountry: "Georgia (GE)",
    hs4: "3208",
  });
  assert.equal(dolu.length, 4);
});

test("filtreler URL query string'e geri cevrilebilir (link paylasilabilir)", () => {
  const f = parseTradeFilters({ project: "12", hs4: "3923", importerCountry: "USA" });
  const q = filtersToQuery(f);
  assert.ok(q.includes("project=12"));
  assert.ok(q.includes("hs4=3923"));
  assert.ok(q.includes("importerCountry=USA"));
  // Gidip-gelme (round trip) ayni filtreyi vermeli
  const back = parseTradeFilters(Object.fromEntries(new URLSearchParams(q.slice(1))));
  assert.deepEqual(back.projectId, 12);
  assert.deepEqual(back.hs4, "3923");
  assert.deepEqual(back.importerCountry, "USA");
});
