import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 3200);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://localhost:${port}`);
});
