(await import('dotenv')).config();
// import debug from 'debug';
import fs from 'fs';
import Botmock from 'botmock';
import minimist from 'minimist';
import Provider from './lib/Provider';
import { supportedNodeTypes } from './util';

process.on('unhandledRejection', err => {
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error(err);
  process.exit(1);
});

const [, , ...args] = process.argv;
const { u: url, d: debug } = minimist(args);

const {
  BOTMOCK_TOKEN,
  BOTMOCK_TEAM_ID,
  BOTMOCK_PROJECT_ID,
  BOTMOCK_BOARD_ID
} = process.env;

const client = new Botmock({
  api_token: BOTMOCK_TOKEN,
  debug: !!debug,
  url: url || 'app'
});

const template = await fs.promises.readFile(
  `${__dirname}/template.json`,
  'utf8'
);
const project = await client.projects(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
const deserializedTemplate = JSON.parse(template);

try {
  const outdir = `${__dirname}/out`;
  try {
    await fs.promises.access(outdir, fs.constants.R_OK);
  } catch (_) {
    // We do not have read access; create the directory that will hold the output
    await fs.promises.mkdir(outdir);
  }
  // Write a single .json file containing the project data
  await fs.promises.writeFile(
    `${outdir}/${toDashCase(project.name)}.json`,
    JSON.stringify({
      ...deserializedTemplate,
      dialog_nodes: await getDialogNodes(project.platform),
      intents: await getIntents(),
      entities: await getEntities(),
      created: project.created_at.date,
      updated: project.updated_at.date,
      name: project.name
    })
  );
  console.log('done');
} catch (err) {
  console.error(err.stack);
  process.exit(1);
} finally {
  // ..
}

async function getIntents() {
  const res = await client.intents(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
  const intents = [];
  for (const x of res) {
    intents.push({
      intent: toDashCase(x.name),
      examples: x.utterances.map(u => ({ text: u.text || '_' })),
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
      entity: toDashCase(x.name),
      created: x.created_at.date,
      updated: x.updated_at.date,
      values: x.data.map(p => ({
        type: 'synonyms',
        value: p.value,
        synonyms: Array.isArray(p.synonyms.split)
          ? p.synonyms.map(toDashCase).split(',')
          : p.synonyms
      }))
    });
  }
  return entities;
}

async function getDialogNodes(platform) {
  const { board } = await client.boards(
    BOTMOCK_TEAM_ID,
    BOTMOCK_PROJECT_ID,
    BOTMOCK_BOARD_ID
  );
  let i;
  const nodes = [];
  const conditionsMap = {};
  const siblingMap = {};
  const provider = new Provider(platform);
  for (let x of board.messages) {
    // console.log(x);
    // TODO: doc
    if (!supportedNodeTypes.has(x.message_type)) {
      console.warn(
        `${x.message_id} is an unsupported type and will be coerced to text`
      );
    }
    // We need to hold on to siblings so that we can define a `previous_sibling`
    // from the perspective of another node.
    if (x.next_message_ids.length > 1) {
      siblingMap[x.message_id] = x.next_message_ids.map(m => m.message_id);
    }
    let previous_sibling;
    const [prev = {}] = x.previous_message_ids;
    const siblings = siblingMap[prev.message_id] || [];
    if ((i = siblings.findIndex(s => x.message_id === s))) {
      previous_sibling = siblings[i - 1];
    }
    const [{ message_id: nextMessageId } = {}] = x.next_message_ids;
    nodes.push({
      output: {
        ...(platform === 'slack'
          ? { [platform]: provider.create(x.message_type, x.payload) }
          : {}),
        generic: [
          {
            response_type: 'text',
            values: [
              {
                text: x.is_root
                  ? `This is a ${platform} project!`
                  : x.payload.text
              }
            ]
          }
        ]
      },
      title: x.payload.nodeName ? toDashCase(x.payload.nodeName) : 'welcome',
      next_step: x.next_message_ids.every(i => !i.action.payload)
        ? {
            behavior: 'skip_user_input',
            selector: 'body',
            dialog_node: nextMessageId
          }
        : {
            behavior: 'jump_to',
            selector: x.is_root ? 'body' : 'user_input',
            dialog_node: nextMessageId
          },
      previous_sibling,
      conditions: x.is_root
        ? 'welcome'
        : conditionsMap[x.message_id] || 'anything_else',
      parent: prev.message_id,
      dialog_node: x.message_id,
      context: Array.isArray(x.payload.context)
        ? x.payload.context.reduce(
            (acc, k) => ({ ...acc, [parseVar(k.name)]: k.default_value }),
            {}
          )
        : {}
    });
    // We maintain a lookup table relating node id to the intent incident on it
    for (const y of x.next_message_ids) {
      if (!y.action.payload) {
        continue;
      }
      conditionsMap[y.message_id] = `#${toDashCase(y.action.payload)}`;
    }
  }
  return nodes;
}

function parseVar(str = '') {
  return str.replace(/%/g, '');
}

function toDashCase(str = '') {
  return str
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/_/g, '');
}
