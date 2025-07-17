const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Test functions
async function testHealthCheck() {
  console.log('🏥 Testing Health Check...');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✓ Health check passed:', response.data);
    return true;
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
    return false;
  }
}

async function testCreateBooking(token) {
  console.log('\n📅 Testing Create Booking...');
  try {
    const bookingData = {
      patientId: 'test-patient-id',
      doctorId: 'test-doctor-id',
      serviceTypeId: 'test-service-id',
      appointmentTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      notes: 'Test booking from API test script'
    };
    
    const response = await axios.post(`${BASE_URL}/bookings`, bookingData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✓ Booking created:', response.data);
    return response.data;
  } catch (error) {
    console.error('✗ Create booking failed:', error.response?.data || error.message);
    return null;
  }
}

async function testListBookings(token) {
  console.log('\n📋 Testing List Bookings...');
  try {
    const response = await axios.get(`${BASE_URL}/bookings`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`✓ Found ${response.data.length || 0} bookings`);
    return response.data;
  } catch (error) {
    console.error('✗ List bookings failed:', error.response?.data || error.message);
    return null;
  }
}

async function testRateLimit() {
  console.log('\n🚦 Testing Rate Limiting...');
  const promises = [];
  
  // Send 15 requests rapidly (limit should be 10 per minute)
  for (let i = 0; i < 15; i++) {
    promises.push(
      axios.get(`${BASE_URL}/health`)
        .then(() => ({ success: true, index: i }))
        .catch(error => ({ 
          success: false, 
          index: i, 
          status: error.response?.status 
        }))
    );
  }
  
  const results = await Promise.all(promises);
  const rateLimited = results.filter(r => r.status === 429);
  
  console.log(`✓ Sent 15 requests: ${results.filter(r => r.success).length} succeeded, ${rateLimited.length} rate limited`);
  
  if (rateLimited.length > 0) {
    console.log('✓ Rate limiting is working correctly');
  } else {
    console.log('⚠️  Rate limiting may not be configured properly');
  }
}

async function main() {
  console.log('🧪 Starting API Tests...\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('================================\n');
  
  // Test health check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.error('\n❌ API is not responding. Make sure the server is running.');
    process.exit(1);
  }
  
  // For authenticated endpoints, you'll need to implement authentication first
  // or use a test token
  const testToken = process.env.TEST_TOKEN || 'your-test-jwt-token';
  
  if (testToken && testToken !== 'your-test-jwt-token') {
    await testCreateBooking(testToken);
    await testListBookings(testToken);
  } else {
    console.log('\n⚠️  Skipping authenticated endpoint tests (no TEST_TOKEN provided)');
  }
  
  // Test rate limiting
  await testRateLimit();
  
  console.log('\n✅ API tests completed!');
}

// Run tests
main().catch(console.error);