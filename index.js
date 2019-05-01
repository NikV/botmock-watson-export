(await import('dotenv')).config();
// import { createNodeCollector } from '@botmock-api/utils'
import Botmock from 'botmock';
import chalk from 'chalk';
import fs from 'fs';
import Provider from './lib/Provider';
import { getArgs, parseVar, toDashCase, supportedNodeTypes } from './util';

const OUTPUT_PATH = `${process.cwd()}/out`;
try {
  await fs.promises.access(OUTPUT_PATH, fs.constants.R_OK);
} catch (_) {
  // Create output directory if it does not already exist
  await fs.promises.mkdir(OUTPUT_PATH);
}

const {
  BOTMOCK_TOKEN,
  BOTMOCK_TEAM_ID,
  BOTMOCK_PROJECT_ID,
  BOTMOCK_BOARD_ID
} = process.env;

const { isInDebug: debug, hostname: url } = getArgs(process.argv);
const client = new Botmock({ api_token: BOTMOCK_TOKEN, debug, url });
const project = await client.projects(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);

// Map an intent to its correct object representation
const getIntentCollection = intent => ({
  intent: toDashCase(intent.name),
  examples: intent.utterances.map(u => ({ text: u.text || '_' })),
  created: intent.created_at.date,
  updated: intent.updated_at.date
});

// Map an entity to its correct object representation
const getEntitiesCollection = entity => ({
  entity: toDashCase(entity.name),
  created: entity.created_at.date,
  updated: entity.updated_at.date,
  values: entity.data.map(({ value, synonyms }) => ({
    type: 'synonyms',
    value,
    synonyms: !Array.isArray(synonyms)
      ? synonyms.map(toDashCase).split(',')
      : synonyms
  }))
});

// Write a single json file containing the project data
try {
  const template = await fs.promises.readFile(
    `${process.cwd()}/template.json`,
    'utf8'
  );
  const deserializedTemplate = JSON.parse(template);
  await fs.promises.writeFile(
    `${OUTPUT_PATH}/${toDashCase(project.name)}.json`,
    JSON.stringify({
      ...deserializedTemplate,
      dialog_nodes: await getDialogNodes(project.platform),
      intents: (await client.intents(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID)).map(
        getIntentCollection
      ),
      entities: (await client.entities(
        BOTMOCK_TEAM_ID,
        BOTMOCK_PROJECT_ID
      )).map(getEntitiesCollection),
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

// Form collection of nodes from messages in the project
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
  // TODO: utils-based fp implementation of this
  for (const message of board.messages) {
    if (!supportedNodeTypes.has(message.message_type)) {
      console.warn(
        chalk.dim(
          `"${
            message.message_type
          }" is an unsupported node type and will be coerced to text`
        )
      );
    }
    // Hold on to sibling nodes to define `previous_sibling` from another node.
    if (message.next_message_ids.length > 1) {
      siblingMap[message.message_id] = message.next_message_ids.map(
        m => m.message_id
      );
    }
    let previous_sibling;
    const [prev = {}] = message.previous_message_ids;
    const siblings = siblingMap[prev.message_id] || [];
    // If there is a sibling with this message id, set the previous_sibling as
    // the sibling before this one
    if ((i = siblings.findIndex(s => message.message_id === s))) {
      previous_sibling = siblings[i - 1];
    }
    let response_type;
    // TODO: ..
    switch (message.message_type) {
      case 'image':
        response_type = 'image';
        break;
      case 'button':
      case 'quick_replies':
        response_type = 'option';
        break;
      default:
        response_type = 'text';
    }
    nodes.push({
      output: {
        ...(platform === 'slack'
          ? {
              [platform]: provider.create(message.message_type, message.payload)
            }
          : {}),
        generic: [
          {
            response_type,
            values: [
              {
                text: message.is_root
                  ? `This is a ${platform} project!`
                  : message.payload.text
              }
            ]
          }
        ]
      },
      title: message.payload.nodeName
        ? toDashCase(message.payload.nodeName)
        : 'welcome',
      next_step: message.next_message_ids.every(i => !i.action.payload)
        ? {
            behavior: 'skip_user_input',
            selector: 'body',
            dialog_node: message.next_message_ids.slice(0, 1).message_id
          }
        : {
            behavior: 'jump_to',
            selector: message.is_root ? 'body' : 'user_input',
            dialog_node: message.next_message_ids.slice(0, 1).message_id
          },
      previous_sibling,
      conditions: message.is_root
        ? 'welcome'
        : conditionsMap[message.message_id] || 'anything_else',
      parent: prev.message_id,
      dialog_node: message.message_id,
      context: Array.isArray(message.payload.context)
        ? message.payload.context.reduce(
            (acc, k) => ({ ...acc, [parseVar(k.name)]: k.default_value }),
            {}
          )
        : {}
    });
    // Maintain lookup table relating message_id -> intent incident on it
    for (const y of message.next_message_ids) {
      if (!y.action.payload) {
        continue;
      }
      conditionsMap[y.message_id] = `#${toDashCase(y.action.payload)}`;
    }
  }
  return nodes;
}
