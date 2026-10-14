const name = "ping";


async function execute(message) {

    await message.reply(
        `Pong! 🏓 \`${Math.round(message.client.ws.ping)}ms\``
    );
}


module.exports = {
    name,
    execute
};
