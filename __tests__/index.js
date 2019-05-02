const fs = require('fs');
const { join } = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

test('runs', async () => {
  const { stdout, stderr } = await promisify(exec)('npm start');
  expect(stdout).toBeTruthy();
  expect(stderr).toBeFalsy();
});

test.todo('creates non-empty output directory');
test.todo('handles projects with loops');
