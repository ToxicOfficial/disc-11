const { Client, Util } = require("discord.js");
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require("./config");
const YouTube = require("simple-youtube-api");
const ytdl = require("ytdl-core");

const bot = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

bot.on("warn", console.warn);

bot.on("error", console.error);

bot.on("ready", () => console.log(`${bot.user.tag} has been successfully turned on!`));

bot.on("disconnect", () => console.log("An error occurred, trying to reconnect!"));

bot.on("reconnecting", () => console.log("I am reconnecting now..."));

bot.on("message", async msg => { // eslint-disable-line
    if (msg.author.bot) return undefined;
    if (!msg.content.startsWith(PREFIX)) return undefined;

    const args = msg.content.split(" ");
    const searchString = args.slice(1).join(" ");
    const url = args[1] ? args[1].replace(/<(.+)>/g, "$1") : "";
    const serverQueue = queue.get(msg.guild.id);

    let command = msg.content.toLowerCase().split(" ")[0];
    command = command.slice(PREFIX.length)

    if (command === "play" && command === "p") {
        const voiceChannel = msg.member.voiceChannel;
        if (!voiceChannel) return msg.channel.send("I'm sorry but you need to be in a voice channel to play a music!");
        const permissions = voiceChannel.permissionsFor(msg.client.user);
        if (!permissions.has("CONNECT")) {
            return msg.channel.send("Sorry, but i need **`CONNECT`** permissions to proceed!");
        }
        if (!permissions.has("SPEAK")) {
            return msg.channel.send("Sorry, but i need **`SPEAK`** permissions to proceed!");
        }

        if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
            const playlist = await youtube.getPlaylist(url);
            const videos = await playlist.getVideos();
            for (const video of Object.values(videos)) {
                const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
                await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
            }
            return msg.channel.send(`<:yes:591629527571234819>  **|**  Playlist: **\`${playlist.title}\`** has been added to the queue!`);
        } else {
            try {
                var video = await youtube.getVideo(url);
            } catch (error) {
                try {
                    var videos = await youtube.searchVideos(searchString, 10);
                    let index = 0;
                    msg.channel.send(`
__**Song selection:**__

${videos.map(video2 => `**\`${++index}\`  |**  ${video2.title}`).join("\n")}

Please provide a value to select one of the search results ranging from 1-10.
					`);
                    // eslint-disable-next-line max-depth
                    try {
                        var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                            maxMatches: 1,
                            time: 10000,
                            errors: ["time"]
                        });
                    } catch (err) {
                        console.error(err);
                        return msg.channel.send("No or invalid value entered, cancelling video selection...");
                    }
                    const videoIndex = parseInt(response.first().content);
                    var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
                } catch (err) {
                    console.error(err);
                    return msg.channel.send("🆘  **|**  I could not obtain any search results.");
                }
            }
            return handleVideo(video, msg, voiceChannel);
        }

    } else if (command === "skip") {
        if (!msg.member.voiceChannel) return msg.channel.send("I'm sorry but you need to be in a voice channel to play a music!");
        if (!serverQueue) return msg.channel.send("There is nothing playing that I could **\`skip\`** for you.");
        serverQueue.connection.dispatcher.end("Skip command has been used!");
        return undefined;

    } else if (command === "stop") {
        if (!msg.member.voiceChannel) return msg.channel.send("I'm sorry but you need to be in a voice channel to play music!");
        if (!serverQueue) return msg.channel.send("There is nothing playing that I could **\`stop\`** for you.");
        serverQueue.songs = [];
        serverQueue.connection.dispatcher.end("Stop command has been used!");
        return undefined;

    } else if (command === "volume") {
        if (!msg.member.voiceChannel) return msg.channel.send("I'm sorry but you need to be in a voice channel to play music!");
        if (!serverQueue) return msg.channel.send("There is nothing playing.");
        if (!args[1]) return msg.channel.send(`The current volume is: **\`${serverQueue.volume}%\`**`);
        serverQueue.volume = args[1];
        serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
        return msg.channel.send(`I set the volume to: **\`${args[1]}%\`**`);

    } else if (command === "np") {
        if (!serverQueue) return msg.channel.send("There is nothing playing.");
        return msg.channel.send(`🎶  **|**  Now Playing: **\`${serverQueue.songs[0].title}\`**`);

    } else if (command === "queue") {
        if (!serverQueue) return msg.channel.send("There is nothing playing.");
        return msg.channel.send(`
__**Song Queue:**__

${serverQueue.songs.map(song => `**-** ${song.title}`).join("\n")}

**Now Playing: \`${serverQueue.songs[0].title}\`**
        `);

    } else if (command === "pause") {
        if (serverQueue && serverQueue.playing) {
            serverQueue.playing = false;
            serverQueue.connection.dispatcher.pause();
            return msg.channel.send("⏸  **|**  Paused the music for you!");
        }
        return msg.channel.send("There is nothing playing.");

    } else if (command === "resume") {
        if (serverQueue && !serverQueue.playing) {
            serverQueue.playing = true;
            serverQueue.connection.dispatcher.resume();
            return msg.channel.send("▶  **|**  Resumed the music for you!");
        }
        return msg.channel.send("There is nothing playing.");
    }
    return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
    const serverQueue = queue.get(msg.guild.id);
    console.log(video);
    const song = {
        id: video.id,
        title: Util.escapeMarkdown(video.title),
        url: `https://www.youtube.com/watch?v=${video.id}`
    };
    if (!serverQueue) {
        const queueConstruct = {
            textChannel: msg.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 50,
            playing: true
        };
        queue.set(msg.guild.id, queueConstruct);

        queueConstruct.songs.push(song);

        try {
            var connection = await voiceChannel.join();
            queueConstruct.connection = connection;
            play(msg.guild, queueConstruct.songs[0]);
        } catch (error) {
            console.error(`I could not join the voice channel: ${error}`);
            queue.delete(msg.guild.id);
            return msg.channel.send(`I could not join the voice channel: **\`${error}\`**`);
        }
    } else {
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        if (playlist) return undefined;
        else return msg.channel.send(`<:yes:591629527571234819>  **|** **\`${song.title}\`** has been added to the queue!`);
    }
    return undefined;
}

function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }
    console.log(serverQueue.songs);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
        .on("end", reason => {
            if (reason === "Stream is not generating quickly enough.") console.log("Song Ended.");
            else console.log(reason);
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

    serverQueue.textChannel.send(`🎶  **|**  Start Playing: **\`${song.title}\`**`);
};

bot.login(TOKEN);