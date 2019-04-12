(await import('dotenv')).config();
import chalk from 'chalk';
import Botmock from 'botmock';
import minimist from 'minimist';
import fs from 'fs';
import Provider from './lib/Provider';
import { parseVar, toDashCase, supportedNodeTypes } from './util';

process.on('unhandledRejection', err => {
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error(err);
  process.exit(1);
});

const {
  BOTMOCK_TOKEN,
  BOTMOCK_TEAM_ID,
  BOTMOCK_PROJECT_ID,
  BOTMOCK_BOARD_ID
} = process.env;
const [, , ...args] = process.argv;
const { u, d } = minimist(args);

const client = new Botmock({
  api_token: BOTMOCK_TOKEN,
  debug: !!d,
  url: u || 'app'
});

const OUTPUT_PATH = `${__dirname}/out`;
const template = await fs.promises.readFile(
  `${__dirname}/template.json`,
  'utf8'
);

// Create output directory if it does not already exist
try {
  await fs.promises.access(OUTPUT_PATH, fs.constants.R_OK);
} catch (_) {
  await fs.promises.mkdir(OUTPUT_PATH);
}

const project = await client.projects(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
try {
  const deserializedTemplate = JSON.parse(template);
  // Write a single .json file containing the project data
  await fs.promises.writeFile(
    `${OUTPUT_PATH}/${toDashCase(project.name)}.json`,
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
  console.log(chalk.bold('done'));
} catch (err) {
  console.error(err.stack);
  process.exit(1);
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
  const provider = new Provider(platform);
  const { board } = await client.boards(
    BOTMOCK_TEAM_ID,
    BOTMOCK_PROJECT_ID,
    BOTMOCK_BOARD_ID
  );
  let i;
  const nodes = [];
  const conditionsMap = {};
  const siblingMap = {};
  for (let x of board.messages) {
    if (!supportedNodeTypes.has(x.message_type)) {
      console.warn(
        chalk.dim(
          `"${
            x.message_type
          }" is an unsupported node type and will be coerced to text`
        )
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
      // TODO: doc
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
      // TODO: doc
      context: Array.isArray(x.payload.context)
        ? x.payload.context.reduce(
            (acc, k) => ({ ...acc, [parseVar(k.name)]: k.default_value }),
            {}
          )
        : {}
    });
    // Maintain lookup table relating message_id -> intent incident on it
    for (const y of x.next_message_ids) {
      if (!y.action.payload) {
        continue;
      }
      conditionsMap[y.message_id] = `#${toDashCase(y.action.payload)}`;
    }
  }
  return nodes;
}
