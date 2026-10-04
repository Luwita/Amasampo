import { parseCsv, toCsv } from '../utils/csv';
import { rowsToProducts } from './BulkUpload';

test('CSV parsing handles quotes, commas, line breaks and Excel byte-order marks', () => {
  const text = '﻿name,description\r\n"Panel, 200W","Says ""wow""\nand more"\r\n\r\nLamp,\r\n';
  expect(parseCsv(text)).toEqual([
    ['name', 'description'],
    ['Panel, 200W', 'Says "wow"\nand more'],
    ['Lamp', ''],
  ]);
  expect(parseCsv(toCsv([['a,b', 'c"d']]))).toEqual([['a,b', 'c"d']]);
});

test('spreadsheet rows become products, with wholesale tiers and options', () => {
  const [row] = rowsToProducts([
    ['Name', 'Category', 'Price', 'Stock', 'Weight kg', 'Made in Zambia', 'Wholesale', 'Options'],
    ['Chitenge', 'Fashion & Chitenge', '180', '300', '1', 'yes', '20:145; 100:128', 'Pattern=Blue|Red'],
  ]);
  expect(row.error).toBeNull();
  expect(row.product).toMatchObject({
    name: 'Chitenge',
    category: 'fashion',
    price: 180,
    stock: 300,
    weightKg: 1,
    local: true,
    tiers: [
      { min: 20, price: 145 },
      { min: 100, price: 128 },
    ],
    options: [{ name: 'Pattern', values: ['Blue', 'Red'] }],
  });
});

test('problem rows are flagged before upload', () => {
  const rows = rowsToProducts([
    ['name', 'category', 'price', 'stock'],
    ['Hoe', 'gardening', '80', '10'],
    ['Spade', 'agri', 'free', '10'],
    ['Rake', 'agri', '90', '2.5'],
    ['Fork', 'agri', '90', '4'],
  ]);
  expect(rows.map((r) => r.error)).toEqual([
    'Unknown category "gardening"',
    'Price must be a number above 0',
    'Stock must be a whole number',
    null,
  ]);
  expect(() => rowsToProducts([['name', 'price']])).toThrow(/missing these columns: category, stock/);
});
