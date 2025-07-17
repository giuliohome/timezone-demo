function updateTimes() {
    // Update browser time
    const now = new Date();
    document.getElementById('browser-time').innerHTML = 
        `<strong>Current Time:</strong> ${now.toLocaleString()} (${now.toISOString()})`;
    document.getElementById('browser-timezone').innerHTML = 
        `<strong>Timezone:</strong> ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
    document.getElementById('browser-offset').innerHTML = 
        `<strong>UTC Offset:</strong> ${now.getTimezoneOffset()} minutes`;
    
    // Fetch server time
    fetch('/api/server-time')
        .then(response => response.json())
        .then(data => {
            document.getElementById('server-time').innerHTML = 
                `<strong>Server Time:</strong> ${new Date(data.serverTime).toLocaleString()} (${data.serverTime})`;
            document.getElementById('server-timezone').innerHTML = 
                `<strong>Server Timezone:</strong> ${data.serverTimezone}`;
            document.getElementById('server-offset').innerHTML = 
                `<strong>Server UTC Offset:</strong> ${data.serverOffset} minutes`;
        })
        .catch(error => {
            document.getElementById('server-time').innerHTML = 
                `<div class="error">Error fetching server time: ${error.message}</div>`;
        });
}

function runTimezoneTests() {
    const results = [];
    const testResults = document.getElementById('test-results');
    
    // Test 1: Check if timezone is detected
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    results.push({
        test: 'Timezone Detection',
        result: timezone ? 'PASS' : 'FAIL',
        message: `Detected timezone: ${timezone}`
    });
    
    // Test 2: Check UTC offset
    const offset = new Date().getTimezoneOffset();
    results.push({
        test: 'UTC Offset',
        result: typeof offset === 'number' ? 'PASS' : 'FAIL',
        message: `UTC offset: ${offset} minutes`
    });
    
    // Test 3: Check if time formatting works
    const formatted = new Date().toLocaleString();
    results.push({
        test: 'Time Formatting',
        result: formatted ? 'PASS' : 'FAIL',
        message: `Formatted time: ${formatted}`
    });
    
    // Test 4: Check if specific timezone can be used
    try {
        const romeTime = new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' });
        results.push({
            test: 'Rome Timezone Test',
            result: 'PASS',
            message: `Rome time: ${romeTime}`
        });
    } catch (e) {
        results.push({
            test: 'Rome Timezone Test',
            result: 'FAIL',
            message: `Error: ${e.message}`
        });
    }
    
    // Display results
    testResults.innerHTML = results.map(r => 
        `<div class="test-result test-${r.result.toLowerCase()}">
            <strong>${r.test}:</strong> ${r.result} - ${r.message}
        </div>`
    ).join('');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    updateTimes();
    // Auto-refresh every 30 seconds
    setInterval(updateTimes, 30000);
});