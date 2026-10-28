'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LibraryFolder, pageTitle, validColor } = require('../src/library');
const { Store } = require('../src/store');
const directory = t => { const result = fs.mkdtempSync(path.join(os.tmpdir(), 'flashborn-library-')); t.after(() => fs.rmSync(result, { recursive: true, force: true })); return result; };
test('Library migration keeps edited text, order, original images, and stable saturated placeholders', t => {
  const root = directory(t), filename = '12345678-1234-1234-1234-123456789012.png';
  fs.mkdirSync(path.join(root, 'library-images'));
  fs.writeFileSync(path.join(root, 'library-images', filename), 'original image');
  const folder = new LibraryFolder(root), items = folder.load([{ id: 'one', kind: 'html', url: 'https://example.com', title: 'Edited title', description: 'Small line', image: filename }, { id: 'two', kind: 'html', url: 'https://example.org' }]);
  assert.ok(items.every(item => validColor(item.color)));
  assert.equal(fs.readFileSync(path.join(folder.images, filename), 'utf8'), 'original image');
  assert.ok(fs.existsSync(path.join(root, 'library-images', filename)));
  const reloaded = new LibraryFolder(root).load([]);
  assert.deepEqual(reloaded, items);
  assert.equal(reloaded[0].description, 'Small line');
});
test('A hand-edited manifest is loaded as the collection and survives ordinary browser saves', t => {
  const root = directory(t), store = new Store(root);
  fs.writeFileSync(store.libraryFolder.file, JSON.stringify({ version: 1, items: [{ id: 'from-file', kind: 'html', title: 'From folder', url: 'https://example.com' }] }));
  const reloaded = new Store(root);
  assert.equal(reloaded.data.library[0].title, 'From folder');
  reloaded.data.library[0].description = 'Saved locally'; reloaded.save();
  assert.equal(JSON.parse(fs.readFileSync(reloaded.libraryFolder.file)).items[0].description, 'Saved locally');
});
test('A prepackaged portfolio is imported once and a user’s later removal stays removed', t => {
  const root = directory(t), seed = path.join(root, 'seed'); fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'manifest.json'), JSON.stringify({ version: 1, items: [{ id: 'portfolio', kind: 'html', url: 'https://example.com', title: 'Portfolio' }] }));
  const folder = new LibraryFolder(path.join(root, 'profile'), seed), items = folder.load([]);
  assert.equal(items.length, 1); folder.save([]);
  assert.deepEqual(new LibraryFolder(path.join(root, 'profile'), seed).load([]), []);
});
test('A damaged manifest is preserved before recovery from the browser profile', t => {
  const root = directory(t), folder = new LibraryFolder(root); fs.mkdirSync(folder.directory);
  fs.writeFileSync(folder.file, '{bad json');
  assert.equal(folder.load([{ id: 'recovered', title: 'Still here' }])[0].title, 'Still here');
  assert.ok(fs.readdirSync(folder.directory).some(name => name.startsWith('manifest.json.recovered-')));
});
test('HTML titles decode entities and ignore commented titles', () => {
  assert.equal(pageTitle('<!-- <title>Ignore</title> --><title>Firstborn &amp; Partners &#x2013; Portfolio</title>'), 'Firstborn & Partners – Portfolio');
  assert.equal(pageTitle('<title>   Hello\n world &#169; </title>'), 'Hello world ©');
  assert.equal(pageTitle('<html>No title</html>'), '');
  assert.equal(pageTitle('<script>const fake="<title>Wrong</title>"</script><title>Real title</title>'), 'Real title');
});
test('Imported entry IDs are unique safe UUIDs, including hand-edited legacy IDs', t => {
  const root = directory(t), id = '12345678-1234-1234-1234-123456789012';
  const items = new LibraryFolder(root).load([{ id }, { id }, { id: '\"><button>' }]);
  assert.equal(new Set(items.map(item => item.id)).size, 3);
  assert.ok(items.every(item => /^[a-f\d-]{36}$/i.test(item.id)));
});
test('Portfolio title/subtitle and creator credits live in the collection manifest and survive restart', t => {
  const root = directory(t), store = new Store(root);
  assert.deepEqual(store.libraryFolder.heading, { title: 'Vas Sloutchevsky', subtitle: 'Flash design portfolio' });
  store.libraryFolder.heading = { title: 'My collection', subtitle: 'Selected work' };
  store.data.library.push({ id: '12345678-1234-1234-1234-123456789012', kind: 'html', title: 'Herman Miller Embody Chair', year: '2006', createdBy: 'Firstborn', url: 'https://example.com' }); store.save();
  const restored = new Store(root);
  assert.equal(restored.libraryFolder.heading.title, 'My collection'); assert.equal(restored.data.library[0].createdBy, 'Firstborn');
  const manifest = JSON.parse(fs.readFileSync(restored.libraryFolder.file)); assert.equal(manifest.heading.subtitle, 'Selected work');
});
