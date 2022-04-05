const express = require("express");
require("dotenv").config();
var SpotifyWebApi = require("spotify-web-api-node");
const app = express();
const port = process.env.PORT;
const matcher = require("./matcher");

const scopes = [
  "ugc-image-upload",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "streaming",
  "app-remote-control",
  "user-read-email",
  "user-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-read-private",
  "playlist-modify-private",
  "user-library-modify",
  "user-library-read",
  "user-top-read",
  "user-read-playback-position",
  "user-read-recently-played",
  "user-follow-read",
  "user-follow-modify",
];

const getCard = (action, title, artist, cover) => {
  return `<table style="min-width:200px border:none;">
  <tr>
    <th style="text-align:left;border:none;" colspan="2" ><strong>${action}</strong></th>
 </tr>
 <tr>
 <td width ="56"><img src="${cover}" alt="cover img" width="56" height="56" style="margin-right: 1em;border:none;"></td>
 <td style="margin-right: 35px;border:none;">
     <div>
       <span style="font-size:1.2em "><strong>${title}</strong></span><br/>
     <span style="font-size:0.9em">${artist}</span>
     </div>
   </td>
   
  </tr>

</table>`;
};

const spotifyApi = new SpotifyWebApi({
  redirectUri: `${process.env.URI}/callback`,
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

app.use(express.json());

app.post("/", async (req, res) => {
  try {
    console.log(req.body);
    const result = await spotifyCommand(req.body.plainTextContent);
    res.send(result);
  } catch (error) {
    res.send(error);
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!");
  spotifyApi.setAccessToken("");
});

app.get("/logout", (req, res) => {
  spotifyApi.setAccessToken("");
  spotifyApi.setRefreshToken("");
  res.send("Logged out");
});

app.get("/login", (req, res) => {
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get("/callback", (req, res) => {
  const error = req.query.error;
  const code = req.query.code;
  const state = req.query.state;

  if (error) {
    console.error("Callback Error:", error);
    res.send(`Callback Error: ${error}`);
    return;
  }

  spotifyApi
    .authorizationCodeGrant(code)
    .then((data) => {
      const access_token = data.body["access_token"];
      const refresh_token = data.body["refresh_token"];
      const expires_in = data.body["expires_in"];

      spotifyApi.setAccessToken(access_token);
      spotifyApi.setRefreshToken(refresh_token);

      console.log("access_token:", access_token);
      console.log("refresh_token:", refresh_token);

      console.log(
        `Sucessfully retreived access token. Expires in ${expires_in} s.`
      );
      res.send("Success! You can now close the window.");

      setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken();
        const access_token = data.body["access_token"];

        console.log("The access token has been refreshed!");
        console.log("access_token:", access_token);
        spotifyApi.setAccessToken(access_token);
      }, (expires_in / 2) * 1000);
    })
    .catch((error) => {
      console.error("Error getting Tokens:", error);
      res.send(`Error getting Tokens: ${error}`);
    });
});

const spotifyCommand = async (command) => {
  console.log(`⚡\t${command}`);

  const data = await matcher(command);
  switch (data.intent) {
    case "help":
      return Promise.resolve(
        `
    <h1>Spotify Commands</h1>
    <a href="${process.env.URI}/login">Login</a><br/>
    <a href="${process.env.URI}/logout">Logout</a><br/>
    <p>Commands:<p>
    <ul>
      <li>queue <song> - Queues a song</li>
      <li>current - Shows the current song playing</li>
      <li>next - Skips to the next song</li>
    </ul>`
      );

      break;

    case "current":
      try {
        const currentSong = await spotifyApi.getMyCurrentPlayingTrack();
        const cover = currentSong.body.item.album.images[0].url;
        const title = currentSong.body.item.name;
        const artist = currentSong.body.item.artists
          .map((artist) => artist.name)
          .join(",");
        return Promise.resolve(getCard("Now Playing", title, artist, cover));
      } catch (error) {
        return Promise.reject(
          `${error?.body?.error?.message ? error.body.error.message : error} 😭`
        );
      }
      break;

    case "queue":
      if (data.entities.groups.Song?.trim() === "") {
        return Promise.reject(`No song title provided 🤬☠💣`);
      }
      let songs = await spotifyApi
        .searchTracks(data.entities.groups.Song.trim())
        .catch((error) =>
          Promise.reject(
            `${
              error?.body?.error?.message ? error.body.error.message : error
            } 😭`
          )
        );
      if (songs.body.tracks.items.length === 0) {
        return Promise.reject(`Song not found 😭`);
      }
      try {
        const addedSong = songs.body.tracks.items[0];
        await spotifyApi.addToQueue(addedSong.uri);
        //const addedSong = await spotifyApi.getTracks(songs.body.items[0].trackIds)
        const cover = addedSong.album.images[0]?.url;
        const title = addedSong.name;
        const artist = addedSong.artists.map((artist) => artist.name).join(",");
        return Promise.resolve(getCard("Added", title, artist, cover));
      } catch (error) {
        return Promise.reject(
          `${error?.body?.error?.message ? error.body.error.message : error} 😭`
        );
      }

      break;

    case "next":
      try {
        await spotifyApi.skipToNext();
        return Promise.resolve("Skipped to next song 🎶");
      } catch (error) {
        return Promise.reject("Could not skip to next song 😭");
      }
      break;
    default:
      return Promise.resolve(`command not Found "${command}" 🤬`);
      break;
  }
};
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
