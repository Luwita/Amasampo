-- The marketplace was renamed from Amasampo to Zed Market; update text stored before the rename.
UPDATE products SET description = replace(description, 'Amasampo', 'Zed Market') WHERE description LIKE '%Amasampo%';
