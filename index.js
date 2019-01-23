const Botmock = require('botmock');
const minimist = require('minimist');
const fs = require('fs');
const [, , ...args] = process.argv;
const client = new Botmock({
  api_token: process.env.BOTMOCK_TOKEN,
  debug: !!minimist(args).d,
  url: 'local'
});
// const SKILL_SIZE_LIMIT = 1e6;
const botmockArgs = [
  process.env.BOTMOCK_TEAM_ID,
  process.env.BOTMOCK_PROJECT_ID,
  process.env.BOTMOCK_BOARD_ID
];
(async () => {
  const outdir = `${__dirname}/out`;
  try {
    const project = await client.projects(...botmockArgs.slice(0, 2));
    try {
      await fs.promises.access(`${outdir}/${project.name}.json`, fs.constants.R_OK);
    } catch (_) {
      // we do not have read access (i.e. this path does not exist)
      await fs.promises.mkdir(outdir);
    }
    const template = await fs.promises.readFile(`${__dirname}/template.json`, 'utf8');
    const deserial = JSON.parse(template);
    // deserial.workspace_id = process.env.WATSON_WORKSPACE_ID;
    deserial.name = project.name;
    deserial.intents = await getIntents();
    deserial.entities = await getEntities();
    deserial.dialog_nodes = await getDialogNodes();
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
  const res = await client.intents(...botmockArgs.slice(0, 2));
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
  const res = await client.entities(...botmockArgs.slice(0, 2));
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
async function getDialogNodes() {
  // const res = await client.variables(...botmockArgs.slice(0, 2));
  const { board } = await client.boards(...botmockArgs);
  const nodes = [];
  for (const x of board.messages) {
    const [prev = {}] = x.previous_message_ids;
    const text = Array.isArray(x.payload.text)
      ? x.payload.text[0].body || ''
      : x.payload.text || '';
    nodes.push({
      title: x.payload.nodeName ? x.payload.nodeName.replace(/\s/g, '-') : 'root',
      parent: prev.message_id || null,
      dialog_node: x.message_id,
      output: {
        generic: [
          {
            values: [{ text }],
            response_type: 'text'
          }
        ]
      }
    });
  }
  return nodes;
}
