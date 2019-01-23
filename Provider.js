const { BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID, BOTMOCK_BOARD_ID } = process.env;
module.exports = class Provider {
  constructor({ platform, client }) {
    const platforms = ['slack', 'facebook'];
    if (!platforms.includes(platform.replace(/\s/g, ''))) {
      throw new Error(`${platform} unsupported`);
    }
    this.platform = platform.replace(/\s/g, '');
    this.client = client;
  }
  async createDialogNodes() {
    // const variables = await client.variables(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
    const { board } = await this.client.boards(
      BOTMOCK_TEAM_ID,
      BOTMOCK_PROJECT_ID,
      BOTMOCK_BOARD_ID
    );
    let i;
    let siblings = [];
    const nodes = [];
    for (const x of board.messages) {
      if (x.next_message_ids.length > 1) {
        siblings = x.next_message_ids.map(m => m.message_id);
      }
      // For any member of siblings, store position at which this sibling was found so
      // that the next sibling can find the `previous_sibling`.
      let previous_sibling;
      if ((i = siblings.findIndex(s => x.message_id === s))) {
        previous_sibling = siblings[i - 1];
      }
      const [prev = {}] = x.previous_message_ids;
      nodes.push({
        title: x.payload.nodeName ? x.payload.nodeName.replace(/\s/g, '-') : '_',
        previous_sibling,
        parent: prev.message_id,
        dialog_node: x.message_id,
        output: {
          [this.platform]: [
            {
              title: x.payload.nodeName,
              author_name: x.payload.sender,
              text: x.payload.text,
              image_url: x.payload.image_url
            }
          ]
        }
      });
    }
    return nodes;
  }
};
