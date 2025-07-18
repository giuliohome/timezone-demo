# Timezone Demo - Correct Way to Handle Timezones in Selenium (Edge Edition)

This demo shows the **correct** way to handle timezone testing in Selenium without modifying infrastructure, using Microsoft Edge browser.

## Why This Approach is Better

1. **No infrastructure changes needed** - No environment variables on Selenium Grid nodes
2. **Test isolation** - Each test can use different timezones
3. **Flexible** - Can test multiple timezones in the same test suite
4. **Maintainable** - Timezone logic stays in test code where it belongs

## How It Works

- Uses Chrome DevTools Protocol (CDP) to override browser timezone (works with Edge too!)
- Fallback to JavaScript injection for compatibility
- Works with both local Edge and Selenium Grid
- Demonstrates real timezone behavior in web applications

## Service Architecture

The demo is split into separate services for better control:

- **`demo-app`** - The web application (runs continuously on port 3000)
- **`demo-tests`** - The Selenium tests (runs once and exits)
- **`selenium-hub`** - Selenium Grid hub
- **`edge-node`** - Microsoft Edge browser node for Selenium

This separation allows you to:
- Run the app independently for manual testing
- Run tests separately against a running app
- Develop and test iteratively without restarting everything

## Running the Demo

### Prerequisites
- Docker and Docker Compose
- Windows Docker Desktop (or Linux with Docker)

### Steps

1. **Clone/create the project structure** with all the files above

2. **Run the demo app only:**
   ```bash
   docker-compose up demo-app
   ```

3. **View the demo app** at http://localhost:3000

4. **Run tests separately (in another terminal):**
   ```bash
   docker-compose --profile testing up demo-tests
   ```

5. **Run everything together (app + tests):**
   ```bash
   docker-compose --profile testing up
   ```

### Manual Testing

You can also run individual components:

```bash
# Run just the demo app (stays running)
docker-compose up demo-app

# Run just Selenium Grid
docker-compose up selenium-hub edge-node

# Run tests against running app
docker-compose --profile testing up demo-tests

# Run tests in one-shot mode
docker-compose run --rm demo-tests

# Run everything including tests
docker-compose --profile testing up --build
```

## Key Points for Your Colleague

1. **Chrome DevTools Protocol** is the official way to control browser behavior (works with Edge too!)
2. **No OS-level timezone changes** needed on Selenium nodes
3. **Better test coverage** - can test multiple timezones easily
4. **Production-ready** - this approach is used by major companies

## Demo Results - What This Proves

This demo successfully demonstrates:

✅ **Chrome DevTools Protocol works perfectly** for timezone override in Edge browser  
✅ **No infrastructure changes needed** - timezone is set in test code  
✅ **Multiple timezones work** - Europe/Rome, America/New_York, Asia/Tokyo all working  
✅ **Real timezone behavior** - proper offsets and time conversion  
✅ **Selenium Grid compatibility** - works with containerized Selenium and Edge  

### Actual Test Results

The tests show real timezone functionality working perfectly:

- **Default timezone (UTC)**: `6:09:06 PM` - Shows server timezone behavior (offset: 0)
- **Rome timezone override**: `8:09:07 PM` - Successfully shows UTC+2 for July CEST (offset: -120 minutes)
- **New York timezone override**: `2:09:07 PM` - Successfully shows UTC-4 for July EDT (offset: 240 minutes)  
- **Multiple timezone comparison**: Successfully tested Europe/Rome, America/New_York, and Asia/Tokyo
- **All tests passing**: Demonstrates robust timezone override functionality

**Notice how the same UTC time (`18:09:07Z`) displays differently in each timezone:**
- UTC: `6:09:06 PM` 
- Rome: `8:09:07 PM` (2 hours ahead)
- New York: `2:09:07 PM` (4 hours behind)

**The core message is proven: timezone testing should be handled in test code using CDP, not infrastructure configuration!**

✅ **All tests now passing successfully!** ✅

## Troubleshooting

### Common Issues and Solutions

1. **"SE_EVENT_BUS_HOST not set" error**:
   - Run `docker-compose down --rmi all` to remove cached images
   - Ensure you're using the updated `docker-compose.yml` with event bus configuration

2. **Tests timing out**:
   - Make sure Selenium Grid is fully started before running tests
   - The demo waits 15 seconds for Grid to be ready

3. **"bash not found" error**:
   - Ensure `docker-compose.yml` uses `sh -c` instead of `bash -c` for Alpine Linux

4. **Docker Compose version warning**:
   - Remove the `version:` line from `docker-compose.yml` (it's obsolete in newer versions)

5. **Tests not running**:
   - Use `--profile testing` to include test services
   - Make sure the demo app is running first: `docker-compose up demo-app`

## Files Included

- `docker-compose.yml` - Complete Selenium Grid + Demo App setup (with Edge)
- `demo-app/` - Simple web app that shows timezone behavior
- `tests/` - Selenium tests demonstrating correct timezone handling with Edge
- `driver-manager.js` - Reusable class for timezone configuration in Edge

This proves that timezone testing should be handled in test code, not infrastructure configuration.