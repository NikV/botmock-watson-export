const env = require('node-env-file');
env(`${__dirname}/.env`);
const Botmock = require('botmock');
const minimist = require('minimist');
const fs = require('fs');
const Provider = require('./Provider');
const [, , ...args] = process.argv;
const {
  BOTMOCK_TOKEN,
  BOTMOCK_TEAM_ID,
  BOTMOCK_PROJECT_ID,
  BOTMOCK_BOARD_ID
} = process.env;
const client = new Botmock({
  api_token: BOTMOCK_TOKEN,
  debug: !!minimist(args).d,
  url: minimist(args).u ? 'local' : 'app'
});
(async () => {
  const outdir = `${__dirname}/out`;
  try {
    const project = await client.projects(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
    try {
      await fs.promises.access(`${outdir}/${project.name}.json`, fs.constants.R_OK);
    } catch (_) {
      // we do not have read access (i.e. this path does not exist)
      await fs.promises.mkdir(outdir);
    }
    const template = await fs.promises.readFile(`${__dirname}/template.json`, 'utf8');
    const deserial = JSON.parse(template);
    const provider = new Provider({ client, platform: project.platform });
    deserial.dialog_nodes = await provider.createDialogNodes();
    deserial.intents = await getIntents();
    deserial.entities = await getEntities();
    deserial.name = project.name;
    await fs.promises.writeFile(
      `${outdir}/${project.name}.json`,
      JSON.stringify(deserial)
    );
    console.log('done');
  } catch (err) {
    console.error(err.stack);
    process.exit(1);
  }
})();
async function getIntents() {
  const res = await client.intents(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
  const intents = [];
  for (const x of res) {
    intents.push({
      intent: x.name,
      examples: x.utterances.map(u => ({ text: u.text })),
      created: x.created_at.date,
      updated: x.updated_at.date
    });
  }
  return intents;
}
async function getEntities() {
  const res = await client.entities(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
  const entities = [];
  for (const x of res) {
    entities.push({
      entity: x.name,
      created: x.created_at.date,
      updated: x.updated_at.date,
      values: x.data.map(p => ({
        type: 'synonyms',
        value: p.value,
        synonyms: typeof p.synonyms !== 'undefined' ? p.synonyms.split(',') : []
      }))
    });
  }
  return entities;
}
