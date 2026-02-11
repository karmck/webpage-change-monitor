# Webpage Change Monitor

Monitor webpages for content changes using a small Node.js CLI.

## Setup

1. Copy the config template:

   ```bash
   cp config.example.json config.json
   ```

2. Edit `config.json` to include the URLs you want to monitor.

## Run

```bash
npm run start
```

Run once and exit:

```bash
npm run start:once
```

## Output

- State is stored in `data/state.json`.
- Change events are appended to `logs/changes.log`.

## Notes

- Requires Node.js 18+ for built-in `fetch`.
- The monitor compares a SHA-256 hash of each response body.
