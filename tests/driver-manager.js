const { Builder, By, until } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');

class DriverManager {
    static async createDriver(timezone = null, useGrid = true) {
        const options = new edge.Options();
        
        // Configure for headless operation (good for CI/CD)
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--window-size=1920,1080');
        
        const builder = new Builder().forBrowser('MicrosoftEdge');
        
        if (useGrid) {
            const hubUrl = process.env.SELENIUM_HUB_URL || 'http://localhost:4444/wd/hub';
            builder.usingServer(hubUrl);
        }
        
        const driver = await builder.setEdgeOptions(options).build();
        
        // Set timezone if specified
        if (timezone) {
            await this.setTimezone(driver, timezone);
        }
        
        return driver;
    }
    
    static async setTimezone(driver, timezone) {
        try {
            // Method 1: Using CDP (Chrome DevTools Protocol - also works with Edge)
            await driver.sendAndGetDevToolsCommand('Emulation.setTimezoneOverride', {
                timezoneId: timezone
            });
            console.log(`Timezone set to: ${timezone}`);
        } catch (error) {
            console.warn(`Failed to set timezone via CDP: ${error.message}`);
            
            // Method 2: Fallback - JavaScript injection
            await driver.executeScript(`
                // Override Intl.DateTimeFormat
                const originalDateTimeFormat = Intl.DateTimeFormat;
                Intl.DateTimeFormat = function(...args) {
                    if (args.length === 0 || (args.length === 1 && typeof args[0] === 'object')) {
                        args[0] = args[0] || {};
                        args[0].timeZone = args[0].timeZone || '${timezone}';
                    }
                    return originalDateTimeFormat.apply(this, args);
                };
                
                // Override Date.prototype.getTimezoneOffset for specific timezones
                const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
                Date.prototype.getTimezoneOffset = function() {
                    // Rome is UTC+1 (winter) / UTC+2 (summer)
                    if ('${timezone}' === 'Europe/Rome') {
                        const date = new Date(this.getTime());
                        const jan = new Date(date.getFullYear(), 0, 1);
                        const jul = new Date(date.getFullYear(), 6, 1);
                        const isDST = originalGetTimezoneOffset.call(date) < Math.max(
                            originalGetTimezoneOffset.call(jan), 
                            originalGetTimezoneOffset.call(jul)
                        );
                        return isDST ? -120 : -60; // Negative because ahead of UTC
                    }
                    return originalGetTimezoneOffset.call(this);
                };
            `);
        }
    }
    
    static async getTimezoneInfo(driver) {
        return await driver.executeScript(`
            return {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                offset: new Date().getTimezoneOffset(),
                currentTime: new Date().toISOString(),
                localTime: new Date().toLocaleString()
            };
        `);
    }
}

module.exports = DriverManager;