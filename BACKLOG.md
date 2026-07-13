# Backlog

Items intentionally deferred while the product is still experimental.

## User-facing features and value

- Show when flag data was last updated and whether it is live, cached, or stale.
- Preserve the last good value for an individual beach during a partial upstream outage.
- Add visible loading and retry states when beach or flag data cannot be loaded.
- Consider a beach list/search view and optional user geolocation.

## Project organisation and setup

- Add parser, schedule, cache-behaviour, and frontend smoke tests once the product shape settles.
- Check upstream HTTP status and response shape explicitly.
- Limit upstream concurrency and coalesce simultaneous cache misses.
- Add metadata, favicon, and social-preview assets.
