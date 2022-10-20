import { indexToToken } from "./token";

const apiRoot = "https://youtube.googleapis.com/youtube/v3/";
const maxResults = 50;

interface PlaylistItem {
  snippet: {
    title: string
    resourceId: {
      videoId: string
    }
    channelId: string
  };
}

interface Subscription {
  snippet: {
    resourceId: { channelId: string }
  };
}

interface Channel {
  id: string;
  snippet: {
    title: string
    thumbnails: {
      default: {
        url: string
      }
    }
  };
  statistics: {
    videoCount: string
  };
  contentDetails: {
    relatedPlaylists: {
      uploads: string
    }
  };
}

interface Playlist {
  id: string;
  snippet: {
    channelId: string
    title: string
    thumbnails: {
      default: {
        url: string
      }
    }
  };
  contentDetails: {
    itemCount: number
  };
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  return array.reduce((chunks, value, index) => {
    if (index % chunkSize == 0) {
      chunks.push([value]);
    } else {
      chunks[chunks.length - 1].push(value);
    }
    return chunks;
  }, []);
}

export class YouTube {
  private readonly authKey: string;

  constructor(authKey: string) {
    this.authKey = authKey;
  }

  private buildURL(resource: string, params?: { part?: string, maxResults?: number, pageToken?: string, fields?: string, [key: string]: any }): URL {
    const url = new URL(resource, apiRoot);
    for (const param in params) {
      url.searchParams.set(param, params[param].toString());
    }
    url.searchParams.set("key", this.authKey);

    return url;
  }

  private async fetchAllPages(url: URL): Promise<any[]> {
    let data = [];
    return fetch(url.toString())
      .then(res => res.json())
      .then(async (body: { nextPageToken?: string, items: any[] }) => {
          data = [...data, ...body.items];
          if (!!body.nextPageToken) {
            url.searchParams.set("pageToken", body.nextPageToken);
            data = [...data, ...(await this.fetchAllPages(url))];
          }
          return data;
        }
      );
  }

  fetchPlaylistIndex(playlistId: string, index: number): Promise<PlaylistItem> {
    const pageToken = indexToToken(index);

    return fetch(this.buildURL("playlistItems", {
      part: "snippet",
      playlistId: playlistId,

      maxResults: 1,
      pageToken: pageToken,
      fields: "items(snippet(title,channelId,resourceId(videoId)))"
    }).toString(), {
      headers: { "Content-Type": "application/json" }
    }).then(res => res.json())
      .then((body: { items: PlaylistItem[] }) => body.items[0]);
  }

  fetchChannels(...channelIds: string[]): Promise<Channel[]> {
    const chunkedRequests = chunkArray(channelIds, maxResults).map(chunk => this.fetchAllPages(this.buildURL("channels", {
      part: "id,snippet,statistics,contentDetails",
      id: chunk.join(","),

      maxResults: maxResults,
      fields: "items(id,snippet(title,thumbnails(default(url))),statistics(videoCount),contentDetails(relatedPlaylists(uploads))),nextPageToken"
    })));
    return Promise.all(chunkedRequests).then(channels => channels.flat());
  }

  fetchSubscriptions(...channelIds: string[]): Promise<Subscription[]> {
    const chunkedRequests = chunkArray(channelIds, maxResults).map(chunk => this.fetchAllPages(this.buildURL("subscriptions", {
      part: "snippet,contentDetails",
      channelId: chunk.join(","),

      maxResults: maxResults,
      fields: "items(snippet(resourceId(channelId))),nextPageToken"
    })));
    return Promise.all(chunkedRequests).then(subscriptions => subscriptions.flat());
  }

  fetchPlaylists(...playlistIds: string[]): Promise<Playlist[]> {
    const chunkedRequests = chunkArray(playlistIds, maxResults).map(chunk => this.fetchAllPages(this.buildURL("playlists", {
      part: "id,snippet,contentDetails",
      id: chunk.join(","),

      maxResults: maxResults,
      fields: "items(id,snippet(channelId,title,thumbnails(default(url))),contentDetails(itemCount)),nextPageToken"
    })));
    return Promise.all(chunkedRequests).then(playlists => playlists.flat());
  }
}