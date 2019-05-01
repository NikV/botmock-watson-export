const fs = require('fs');
const { join } = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

test('runs', async () => {
  const { stderr } = await promisify(exec)('npm start');
  expect(stderr).toContain('');
});

test.todo('creates non-empty output directory')
