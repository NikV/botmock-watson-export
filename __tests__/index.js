import { promisify } from 'util';
import { exec as exec_ } from 'child_process';

const exec = promisify(exec_);

it('initializes', async () => {
  const { stdout } = await exec('npm start');
  expect(stdout).toContain('done');
});
