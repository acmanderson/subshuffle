import { Hono } from "hono";
import { YouTube } from "./util/youtube";
import { maxIndex } from "./util/token";

const app = new Hono();
app.use("*", async (c, next) => {
  // can't seem to reference secrets in global scope, so set api client per request
  c.set("youtube", new YouTube(c.env.YOUTUBE_AUTH_KEY));
  await next();
});

interface SessionEntry {
  id: string;
  title: string;
  type: "subscriptions" | "channel" | "playlist";

  playlistId?: string;
  videoCount?: number;
  viewedIndexes?: number[];
}

interface Session {
  items: SessionEntry[];
}

const v1 = new Hono();
v1.post("/session/new", async (c) => {
  const youtube: YouTube = c.get("youtube");
  const body = await c.req.json<Session>();
  // group session entries by type, so we can avoid duplicates and consolidate requests
  const groupedSessionEntries = body.items.reduce((groups, sessionEntry) => {
    groups[sessionEntry.type].add(sessionEntry.id);
    return groups;
  }, { subscriptions: new Set<string>(), channel: new Set<string>(), playlist: new Set<string>() });

  const session: Session = { items: [] };
  if (groupedSessionEntries.subscriptions.size > 0) {
    // fetch subscriptions first, so we can combine later requests for channels
    await youtube.fetchSubscriptions(...Array.from(groupedSessionEntries.subscriptions))
      .then(subscriptions => {
        subscriptions.forEach(subscription => {
          groupedSessionEntries.channel.add(subscription.snippet.resourceId.channelId);
        });
      });
  }
  const promises = [];
  if (groupedSessionEntries.channel.size > 0) {
    promises.push(youtube.fetchChannels(...Array.from(groupedSessionEntries.channel))
      .then(channels => {
        channels.forEach(channel => {
          session.items.push({
            id: channel.id,
            title: channel.snippet.title,
            type: "channel",

            playlistId: channel.contentDetails.relatedPlaylists.uploads,
            videoCount: Math.min(parseInt(channel.statistics.videoCount), maxIndex),
            viewedIndexes: []
          });
        });
      })
    );
  }
  if (groupedSessionEntries.playlist.size > 0) {
    promises.push(youtube.fetchPlaylists(...Array.from(groupedSessionEntries.playlist))
      .then(playlists => {
        playlists.forEach(playlist => {
          session.items.push({
            id: playlist.id,
            title: playlist.snippet.title,
            type: "playlist",

            playlistId: playlist.id,
            videoCount: Math.min(playlist.contentDetails.itemCount, maxIndex),
            viewedIndexes: []
          });
        });
      }));
  }
  await Promise.all(promises);

  return c.json(session);
});
v1.post("/session/shuffle", async (c) => {
  const youtube: YouTube = c.get("youtube");
  const session = await c.req.json<Session>();
  const randomSessionIndex = session.items.length * Math.random() << 0;
  const randomEntry = session.items[randomSessionIndex];

  let randomIndex: number;
  if (randomEntry.viewedIndexes?.length > 0) {
    // exclude viewed videos
    // TODO: reset once all videos are viewed
    const allIndexes = new Set(Array(randomEntry.videoCount).keys());
    const viewedIndexes = new Set(Array.from(randomEntry.viewedIndexes));
    const availableIndexes = Array.from(allIndexes).filter(i => !viewedIndexes.has(i));
    randomIndex = availableIndexes[availableIndexes.length * Math.random() << 0];
  } else {
    randomIndex = randomEntry.videoCount * Math.random() << 0;
  }
  const randomVideo = await youtube.fetchPlaylistIndex(randomEntry.playlistId, randomIndex);

  // update view history for session entry
  randomEntry.viewedIndexes = [randomIndex, ...randomEntry.viewedIndexes].sort();
  session.items[randomSessionIndex] = randomEntry;

  return c.json({
    session: session,
    video: {
      title: randomVideo.snippet.title,
      videoId: randomVideo.snippet.resourceId.videoId,
      channelId: randomVideo.snippet.channelId
    }
  });
});

app.route("/v1", v1);
app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ "error": `${err}` }, 500);
});

export default app;
