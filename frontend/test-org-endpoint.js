// Test script to check organization endpoint response
// Run this in browser console or with node

async function testOrganizations() {
    try {
        const response = await fetch('/api/organization', {
            cache: 'no-store'
        });
        
        const data = await response.json();
        
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
        console.log('Is Array:', Array.isArray(data));
        console.log('Is Object with items:', data?.items !== undefined);
        
        return data;
    } catch (error) {
        console.error('Error:', error);
    }
}

// Run the test
testOrganizations();
