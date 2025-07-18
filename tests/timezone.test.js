const DriverManager = require('./driver-manager');
const { By, until } = require('selenium-webdriver');

describe('Timezone Demo Tests', () => {
    let driver;
    let drivers = [];
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    
    afterEach(async () => {
        if (driver) {
            try {
                await driver.quit();
            } catch (error) {
                // Ignore cleanup errors
            }
            driver = null;
        }
        
        for (const d of drivers) {
            try {
                await d.quit();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
        drivers = [];
    });
    
    test('Default timezone behavior', async () => {
        driver = await DriverManager.createDriver();
        
        await driver.get(appUrl);
        await driver.wait(until.elementLocated(By.id('browser-timezone')), 10000);
        
        const timezoneInfo = await DriverManager.getTimezoneInfo(driver);
        
        expect(timezoneInfo.timezone).toBeDefined();
        expect(timezoneInfo.offset).toBeDefined();
        expect(timezoneInfo.currentTime).toBeDefined();
        
        const browserTimezone = await driver.findElement(By.id('browser-timezone')).getText();
        expect(browserTimezone).toContain('Timezone:');
    });
    
    test('Rome timezone override', async () => {
        driver = await DriverManager.createDriver('Europe/Rome');
        
        await driver.get(appUrl);
        await driver.wait(until.elementLocated(By.id('browser-timezone')), 10000);
        
        const timezoneInfo = await DriverManager.getTimezoneInfo(driver);
        
        expect(timezoneInfo.timezone).toBe('Europe/Rome');
        expect(timezoneInfo.offset).toBeGreaterThanOrEqual(-120);
        expect(timezoneInfo.offset).toBeLessThanOrEqual(-60);
        
        const browserTimezone = await driver.findElement(By.id('browser-timezone')).getText();
        expect(browserTimezone).toContain('Europe/Rome');
    });
    
    test('New York timezone override', async () => {
        driver = await DriverManager.createDriver('America/New_York');
        
        await driver.get(appUrl);
        await driver.wait(until.elementLocated(By.id('browser-timezone')), 10000);
        
        const timezoneInfo = await DriverManager.getTimezoneInfo(driver);
        
        expect(timezoneInfo.timezone).toBe('America/New_York');
        expect(timezoneInfo.offset).toBeGreaterThanOrEqual(240);
        expect(timezoneInfo.offset).toBeLessThanOrEqual(300);
    });
    
    test('Multiple timezone comparison', async () => {
        const timezones = ['Europe/Rome', 'America/New_York', 'Asia/Tokyo'];
        const results = [];
        
        for (const timezone of timezones) {
            const testDriver = await DriverManager.createDriver(timezone);
            drivers.push(testDriver);
            
            await testDriver.get(appUrl);
            await testDriver.wait(until.elementLocated(By.id('browser-timezone')), 10000);
            
            const timezoneInfo = await DriverManager.getTimezoneInfo(testDriver);
            results.push({
                expected: timezone,
                actual: timezoneInfo.timezone,
                offset: timezoneInfo.offset
            });
            
            await testDriver.quit();
        }
        
        results.forEach(result => {
            expect(result.actual).toBe(result.expected);
        });
        
        const offsets = results.map(r => r.offset);
        const uniqueOffsets = [...new Set(offsets)];
        expect(uniqueOffsets.length).toBeGreaterThan(1);
        
        drivers = [];
    });
    
    test('Timezone affects date formatting', async () => {
        driver = await DriverManager.createDriver('Europe/Rome');
        await driver.get(appUrl);
        await driver.wait(until.elementLocated(By.id('browser-timezone')), 15000);
        
        const romeTime = await driver.executeScript(`
            return new Date().toLocaleString();
        `);
        
        expect(romeTime).toBeDefined();
        expect(typeof romeTime).toBe('string');
        expect(romeTime.length).toBeGreaterThan(0);
    }, 30000);
});