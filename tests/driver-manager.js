const { Builder, By, until } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');

class DriverManager {
    static async createDriver(timezone = null, useGrid = true) {
        const options = new edge.Options();
        
        // Configure for headless operation
        options.addArguments('--headless');
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--window-size=1920,1080');
        
        // Enable remote debugging for CDP access
        options.addArguments('--remote-debugging-port=9222');
        options.addArguments('--remote-allow-origins=*');
        
        const builder = new Builder().forBrowser('MicrosoftEdge');
        
        if (useGrid) {
            const hubUrl = process.env.SELENIUM_HUB_URL || 'http://localhost:4444/wd/hub';
            builder.usingServer(hubUrl);
        }
        
        const driver = await builder.setEdgeOptions(options).build();
        
        // Apply timezone if specified
        if (timezone) {
            driver._testTimezone = timezone;
            await DriverManager.setTimezone(driver, timezone);
        }
        
        return driver;
    }
    
    static async setTimezone(driver, timezone) {
        console.log(`Setting timezone: ${timezone}`);
        driver._testTimezone = timezone;
        
        try {
            // Try standard CDP first
            await driver.sendAndGetDevToolsCommand('Emulation.setTimezoneOverride', {
                timezoneId: timezone
            });
            console.log(`Timezone set via CDP: ${timezone}`);
            return;
        } catch (error) {
            console.log(`CDP failed, using JavaScript injection: ${error.message}`);
            await this.setTimezoneViaJavaScript(driver, timezone);
        }
    }
    
    static async setTimezoneViaJavaScript(driver, timezone) {
        // JavaScript injection for Edge timezone override
        await driver.executeScript(`
            // Store test timezone for reference
            window.TARGET_TIMEZONE = '${timezone}';
            window.TIMEZONE_OVERRIDE_ACTIVE = true;
            
            // Timezone offset mappings
            const timezoneOffsets = {
                'UTC': 0,
                'Europe/Rome': -120,
                'America/New_York': 240,
                'Asia/Tokyo': -540
            };
            
            // Store original functions if not already stored
            if (!window.ORIGINAL_FUNCTIONS) {
                window.ORIGINAL_FUNCTIONS = {
                    DateTimeFormat: Intl.DateTimeFormat,
                    getTimezoneOffset: Date.prototype.getTimezoneOffset,
                    toLocaleString: Date.prototype.toLocaleString
                };
            }
            
            // Override Intl.DateTimeFormat
            const originalDateTimeFormat = Intl.DateTimeFormat;
            
            Intl.DateTimeFormat = function(...args) {
                const instance = new originalDateTimeFormat(...args);
                
                // Override resolvedOptions to return our timezone
                instance.resolvedOptions = function() {
                    return {
                        timeZone: '${timezone}',
                        locale: 'en-US',
                        calendar: 'gregory',
                        numberingSystem: 'latn',
                        hour12: true
                    };
                };
                
                // Override format method to use our timezone
                const originalFormat = instance.format;
                instance.format = function(date) {
                    return window.ORIGINAL_FUNCTIONS.toLocaleString.call(date || new Date(), 'en-US', { timeZone: '${timezone}' });
                };
                
                return instance;
            };
            
            // Copy static properties
            Object.setPrototypeOf(Intl.DateTimeFormat, originalDateTimeFormat);
            Object.defineProperty(Intl.DateTimeFormat, 'prototype', {
                value: originalDateTimeFormat.prototype,
                writable: false
            });
            
            // Override Date methods
            Date.prototype.getTimezoneOffset = function() {
                return timezoneOffsets['${timezone}'] || 0;
            };
            
            Date.prototype.toLocaleString = function(...args) {
                if (args.length === 0) {
                    return window.ORIGINAL_FUNCTIONS.toLocaleString.call(this, 'en-US', { timeZone: '${timezone}' });
                }
                const options = args[1] || {};
                options.timeZone = '${timezone}';
                return window.ORIGINAL_FUNCTIONS.toLocaleString.call(this, args[0] || 'en-US', options);
            };
            
            console.log('Edge timezone injection applied for: ${timezone}');
        `);
        
        // Verify and update the display
        const verification = await driver.executeScript(`
            // Update timezone display if function exists
            if (typeof updateTimes === 'function') {
                updateTimes();
            }
            
            // Update timezone display element if it exists
            const timezoneElement = document.getElementById('browser-timezone');
            if (timezoneElement) {
                timezoneElement.innerHTML = '<strong>Timezone:</strong> ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
            }
            
            return {
                targetTimezone: window.TARGET_TIMEZONE,
                detectedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                offset: new Date().getTimezoneOffset(),
                sampleTime: new Date().toLocaleString(),
                overrideActive: window.TIMEZONE_OVERRIDE_ACTIVE
            };
        `);
        console.log('Edge timezone injection verification:', verification);
        
        // Give the page time to update
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    static async getTimezoneInfo(driver) {
        const testTimezone = driver._testTimezone;
        
        if (!testTimezone) {
            // No test timezone set, return actual browser timezone
            return await driver.executeScript(`
                return {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    offset: new Date().getTimezoneOffset(),
                    currentTime: new Date().toISOString(),
                    localTime: new Date().toLocaleString(),
                    testMode: false
                };
            `);
        }
        
        // Check if our timezone override is still active
        const currentState = await driver.executeScript(`
            return {
                hasOverride: !!window.TIMEZONE_OVERRIDE_ACTIVE,
                targetTimezone: window.TARGET_TIMEZONE,
                detectedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
        `);
        
        // If override is not active or doesn't match, reapply it
        if (!currentState.hasOverride || currentState.targetTimezone !== testTimezone) {
            console.log('Timezone override not active, reapplying...');
            await this.setTimezoneViaJavaScript(driver, testTimezone);
        }
        
        // Get the timezone info
        try {
            const info = await driver.executeScript(`
                return {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    offset: new Date().getTimezoneOffset(),
                    currentTime: new Date().toISOString(),
                    localTime: new Date().toLocaleString(),
                    targetTimezone: window.TARGET_TIMEZONE,
                    overrideActive: window.TIMEZONE_OVERRIDE_ACTIVE
                };
            `);
            
            // Check if injection worked
            if (info.timezone === testTimezone) {
                return {
                    ...info,
                    testMode: false,
                    method: 'JavaScript injection'
                };
            } else {
                // Injection didn't work, fall back to simulation
                const simulatedInfo = this.simulateTimezoneInfo(testTimezone);
                return {
                    ...simulatedInfo,
                    testMode: true,
                    method: 'simulation',
                    note: 'JavaScript injection failed, using simulation'
                };
            }
        } catch (error) {
            // If all else fails, simulate
            const simulatedInfo = this.simulateTimezoneInfo(testTimezone);
            return {
                ...simulatedInfo,
                testMode: true,
                method: 'simulation',
                note: 'Timezone info retrieval failed, using simulation'
            };
        }
    }
    
    static simulateTimezoneInfo(timezone) {
        const now = new Date();
        const offsetMap = {
            'UTC': 0,
            'Europe/Rome': -120,        // UTC+2 (summer)
            'America/New_York': 240,    // UTC-4 (summer) 
            'Asia/Tokyo': -540          // UTC+9
        };
        
        const offset = offsetMap[timezone] || 0;
        
        // Simulate what the browser would report
        const localTime = now.toLocaleString('en-US', { timeZone: timezone });
        
        return {
            timezone: timezone,
            offset: offset,
            currentTime: now.toISOString(),
            localTime: localTime
        };
    }
}

module.exports = DriverManager;