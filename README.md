# botmock-watson-export

> requires node >= 10.15.x

Script to transform a [Botmock](https://botmock.com) project into a `.json` file that's importable as a Watson Assistant skill.

## Guide

### Setup

Clone this repo by running `git clone git@github.com:Botmock/botmock-watson-export.git`

Run `npm install`

Create a `.env` file with the following variables (and your values filled in):
```console
BOTMOCK_TOKEN=""
BOTMOCK_TEAM_ID=""
BOTMOCK_PROJECT_ID=""
BOTMOCK_BOARD_ID=""

```

Run `node index.js`

Find generated JSON in `./out`

The generated `.json` file should look something like:

```json
{"name": "project","intents": [],"entities": [],"language": "en","metadata": {},"description": "","dialog_nodes": [],"workspace_id": "","counterexamples": [],"learning_opt_out": false,"status": "Non Existent"}
```

<!-- ### Importing into Watson

- Visit [your IBM dashboard](https://cloud.ibm.com) -->
