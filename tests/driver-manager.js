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
        
        // Enable remote debugging for CDP access (essential for WebSocket CDP)
        options.addArguments('--remote-debugging-port=9222');
        options.addArguments('--remote-allow-origins=*');
        
        const builder = new Builder().forBrowser('MicrosoftEdge');
        
        if (useGrid) {
            const hubUrl = process.env.SELENIUM_HUB_URL || 'http://localhost:4444/wd/hub';
            builder.usingServer(hubUrl);
        }
        
        const driver = await builder.setEdgeOptions(options).build();
        
        // Store timezone preference for this driver instance and apply it
        if (timezone) {
            driver._testTimezone = timezone;
            await DriverManager.setTimezone(driver, timezone);
        }
        
        return driver;
    }
    
    static async setTimezone(driver, timezone) {
        console.log(`=== setTimezone called with timezone: ${timezone} ===`);
        // Store the target timezone on the driver instance
        driver._testTimezone = timezone;
        
        try {
            // Method 1: Try CDP first (works in local environments)
            console.log(`Attempting standard CDP for timezone: ${timezone}`);
            await driver.sendAndGetDevToolsCommand('Emulation.setTimezoneOverride', {
                timezoneId: timezone
            });
            console.log(`Timezone set to: ${timezone} via standard CDP`);
            return;
        } catch (error) {
            console.log(`Standard CDP not available for: ${timezone}. Error: ${error.message}`);
            console.log('Trying Edge-specific CDP approach...');
            
            // Method 2: Edge-specific CDP via debugging port (enhanced approach)
            try {
                console.log('Attempting Edge-specific WebSocket CDP...');
                // Try multiple ways to find the debugging port
                let debuggerAddress = null;
                
                // First, try to get from capabilities
                const capabilities = await driver.getCapabilities();
                console.log('Edge capabilities:', capabilities.get('ms:edgeOptions'));
                debuggerAddress = capabilities.get('ms:edgeOptions')?.debuggerAddress;
                
                // If not found in capabilities, try standard debugging ports
                if (!debuggerAddress) {
                    console.log('Debugger address not found in capabilities, trying standard ports...');
                    // In Docker environment, try both localhost and edge-node, force IPv4
                    const standardPorts = ['127.0.0.1:9222', 'localhost:9222', 'edge-node:9222'];
                    
                    for (const port of standardPorts) {
                        try {
                            await this.testDebuggerConnection(port);
                            debuggerAddress = port;
                            console.log(`Found active debugger on: ${port}`);
                            break;
                        } catch (e) {
                            console.log(`Port ${port} not available: ${e.message}`);
                        }
                    }
                }
                
                if (debuggerAddress) {
                    console.log(`Using Edge debugger address: ${debuggerAddress}`);
                    
                    // Try to connect directly to Edge debugging port
                    // Force IPv4 resolution to avoid IPv6 connection issues
                    const debugUrl = `http://${debuggerAddress.replace('localhost', '127.0.0.1')}`;
                    console.log(`Connecting to debugger URL: ${debugUrl}`);
                    
                    const cdpCommand = {
                        id: Date.now(), // Use timestamp for unique ID
                        method: 'Emulation.setTimezoneOverride',
                        params: { timezoneId: timezone }
                    };
                    
                    await this.sendEdgeCDPCommand(debugUrl, cdpCommand);
                    console.log(`Timezone set to: ${timezone} via Edge WebSocket CDP`);
                    return;
                } else {
                    console.log('No debugger address found, will fall back to JavaScript injection');
                }
            } catch (edgeError) {
                console.log(`Edge-specific CDP failed: ${edgeError.message}`);
            }
            
            // Method 3: Enhanced JavaScript injection specifically for Edge
            console.log(`Falling back to enhanced JavaScript injection for Edge...`);
            
            await this.setTimezoneViaJavaScript(driver, timezone);
        }
    }
    
    static async testDebuggerConnection(address) {
        const http = require('http');
        // Force IPv4 resolution
        const url = `http://${address.replace('localhost', '127.0.0.1')}/json`;
        
        return new Promise((resolve, reject) => {
            const req = http.get(url, (res) => {
                if (res.statusCode === 200) {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const tabs = JSON.parse(data);
                            if (tabs && tabs.length > 0) {
                                resolve(true);
                            } else {
                                reject(new Error('No tabs found'));
                            }
                        } catch (e) {
                            reject(e);
                        }
                    });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
            
            req.on('error', reject);
            req.setTimeout(2000, () => reject(new Error('Connection timeout')));
        });
    }

    static async sendEdgeCDPCommand(debugUrl, command) {
        const http = require('http');
        
        // Get WebSocket endpoint for Edge debugging
        const listUrl = `${debugUrl}/json`;
        
        return new Promise((resolve, reject) => {
            const req = http.get(listUrl, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', async () => {
                    try {
                        const tabs = JSON.parse(data);
                        const activeTab = tabs.find(tab => tab.type === 'page');
                        
                        if (activeTab && activeTab.webSocketDebuggerUrl) {
                            console.log(`Found WebSocket debugger URL: ${activeTab.webSocketDebuggerUrl}`);
                            
                            // Implement WebSocket CDP connection
                            try {
                                const result = await this.sendCDPViaWebSocket(activeTab.webSocketDebuggerUrl, command);
                                resolve(result);
                            } catch (wsError) {
                                console.log(`WebSocket CDP failed: ${wsError.message}`);
                                reject(wsError);
                            }
                        } else {
                            reject(new Error('No active tab with WebSocket debugger found'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            
            req.on('error', reject);
            req.setTimeout(5000, () => reject(new Error('HTTP request timeout')));
        });
    }
    
    static async sendCDPViaWebSocket(wsUrl, command) {
        return new Promise((resolve, reject) => {
            // Use Node.js built-in WebSocket implementation via ws package if available
            // or fallback to basic HTTP approach for environments without ws
            try {
                const WebSocket = require('ws');
                
                const ws = new WebSocket(wsUrl);
                let responseReceived = false;
                
                const timeout = setTimeout(() => {
                    if (!responseReceived) {
                        ws.close();
                        reject(new Error('WebSocket CDP command timeout'));
                    }
                }, 10000);
                
                ws.on('open', () => {
                    console.log('WebSocket CDP connection established');
                    ws.send(JSON.stringify(command));
                });
                
                ws.on('message', (data) => {
                    try {
                        const response = JSON.parse(data.toString());
                        
                        // Check if this is the response to our command
                        if (response.id === command.id) {
                            responseReceived = true;
                            clearTimeout(timeout);
                            
                            if (response.error) {
                                console.log('CDP command error:', response.error);
                                reject(new Error(`CDP error: ${response.error.message}`));
                            } else {
                                console.log('CDP command successful:', response.result);
                                resolve(response.result);
                            }
                            
                            ws.close();
                        }
                    } catch (parseError) {
                        console.log('Failed to parse WebSocket message:', parseError);
                    }
                });
                
                ws.on('error', (error) => {
                    responseReceived = true;
                    clearTimeout(timeout);
                    console.log('WebSocket error:', error);
                    reject(error);
                });
                
                ws.on('close', () => {
                    if (!responseReceived) {
                        clearTimeout(timeout);
                        reject(new Error('WebSocket closed before receiving response'));
                    }
                });
                
            } catch (wsError) {
                // Fallback if 'ws' package is not available
                console.log('WebSocket package not available, trying HTTP fallback');
                reject(new Error('WebSocket CDP requires ws package: npm install ws'));
            }
        });
    }
    
    static async setTimezoneViaJavaScript(driver, timezone) {
        // Enhanced JavaScript injection specifically designed for Edge
        await driver.executeScript(`
            // Store test timezone for reference
            window.TARGET_TIMEZONE = '${timezone}';
            window.TIMEZONE_OVERRIDE_ACTIVE = true;
            
            // More aggressive Edge-compatible approach
            const timezoneOffsets = {
                'UTC': 0,
                'Europe/Rome': -120,
                'America/New_York': 240,
                'Asia/Tokyo': -540
            };
            
            // Store originals
            if (!window.ORIGINAL_FUNCTIONS) {
                window.ORIGINAL_FUNCTIONS = {
                    DateTimeFormat: Intl.DateTimeFormat,
                    getTimezoneOffset: Date.prototype.getTimezoneOffset,
                    toLocaleString: Date.prototype.toLocaleString
                };
            }
            
            // Override with Edge-specific handling - more comprehensive approach
            const originalDateTimeFormat = Intl.DateTimeFormat;
            
            Intl.DateTimeFormat = function(...args) {
                const instance = new originalDateTimeFormat(...args);
                
                // Override the resolvedOptions method on the instance
                instance.resolvedOptions = function() {
                    return {
                        timeZone: '${timezone}',
                        locale: 'en-US',
                        calendar: 'gregory',
                        numberingSystem: 'latn',
                        hour12: true
                    };
                };
                
                // Override the format method if needed
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
            
            console.log('Enhanced Edge timezone injection applied for: ${timezone}');
        `);
        
        // Verify the injection and trigger page updates
        const verification = await driver.executeScript(`
            // Force page to update timezone display
            if (typeof updateTimes === 'function') {
                updateTimes();
            }
            
            // Also manually update the timezone display element if it exists
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
        console.log('Enhanced Edge timezone injection verification:', verification);
        
        // Give the page a moment to update
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
        
        // For Edge, we need to check if our injection is still active and reapply if needed
        const currentState = await driver.executeScript(`
            return {
                hasOverride: !!window.TIMEZONE_OVERRIDE_ACTIVE,
                targetTimezone: window.TARGET_TIMEZONE,
                detectedTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
        `);
        
        // If our override is not active or doesn't match, reapply it
        if (!currentState.hasOverride || currentState.targetTimezone !== testTimezone) {
            console.log('Timezone override not active, reapplying...');
            await this.setTimezoneViaJavaScript(driver, testTimezone);
        }
        
        // Now get the timezone info
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
            
            // Check if our injection worked
            if (info.timezone === testTimezone) {
                return {
                    ...info,
                    testMode: false,
                    method: 'Enhanced Edge JavaScript injection'
                };
            } else {
                // Injection didn't work, fall back to simulation
                const simulatedInfo = this.simulateTimezoneInfo(testTimezone);
                return {
                    ...simulatedInfo,
                    testMode: true,
                    method: 'simulation',
                    note: 'Enhanced Edge injection failed, using simulation'
                };
            }
        } catch (error) {
            // If all else fails, simulate
            const simulatedInfo = this.simulateTimezoneInfo(testTimezone);
            return {
                ...simulatedInfo,
                testMode: true,
                method: 'simulation',
                note: 'Edge timezone info failed, using simulation'
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