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
    const vs = await this.client.variables(BOTMOCK_TEAM_ID, BOTMOCK_PROJECT_ID);
    const context = vs.reduce((acc, v) => ({ ...acc, [v.name]: v.default_value }), {});
    const nodes = [];
    const siblingMap = {};
    const { board } = await this.client.boards(
      BOTMOCK_TEAM_ID,
      BOTMOCK_PROJECT_ID,
      BOTMOCK_BOARD_ID
    );
    let i;
    for (const x of board.messages) {
      const [prev = {}] = x.previous_message_ids;
      // We need to hold on to siblings so that we can define a `previous_sibling`
      // from the perspective of another node.
      if (x.next_message_ids.length > 1) {
        siblingMap[x.message_id] = x.next_message_ids.map(m => m.message_id);
      }
      let previous_sibling;
      const siblings = siblingMap[prev.message_id] || [];
      if ((i = siblings.findIndex(s => x.message_id === s))) {
        previous_sibling = siblings[i - 1];
      }
      nodes.push({
        title: x.payload.nodeName ? x.payload.nodeName.replace(/\s/g, '-') : '_',
        previous_sibling,
        parent: prev.message_id,
        dialog_node: x.message_id,
        context,
        output: {
          [this.platform]: [
            {
              title: x.payload.nodeName,
              image_url: x.payload.image_url,
              ...(this.platform === 'slack'
                ? {
                    author_name: x.payload.sender,
                    text: x.payload.text
                  }
                : {})
            }
          ]
        }
      });
    }
    return nodes;
  }
};
