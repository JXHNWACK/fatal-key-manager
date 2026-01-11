const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false // Railway uses internal networking, no SSL needed
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

// Initialize database table
async function initDatabase() {
  try {
    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS keys (
        id VARCHAR(255) PRIMARY KEY,
        code VARCHAR(255) NOT NULL UNIQUE,
        product VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'available',
        assigned_to VARCHAR(255),
        reason TEXT,
        date TIMESTAMP,
        assigned_by VARCHAR(255),
        history JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Table "keys" created/verified');
    
    // Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_keys_product ON keys(product)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_keys_code ON keys(code)');
    console.log('✓ Indexes created/verified');
    
    // Check if table has data
    const countResult = await pool.query('SELECT COUNT(*) FROM keys');
    console.log(`✓ Database ready - ${countResult.rows[0].count} keys in database`);
    
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  }
}

// Initialize database on startup
initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Helper function to generate UID
function uid() {
  return crypto.randomUUID();
}

// ==================== API ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manual database initialization endpoint
app.post('/api/init-db', async (req, res) => {
  try {
    await initDatabase();
    res.json({ success: true, message: 'Database initialized successfully' });
  } catch (err) {
    console.error('Manual DB init failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all keys
app.get('/api/keys', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      'SELECT * FROM keys ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching keys:', err);
    res.status(500).json({ error: 'Failed to fetch keys' });
  }
});

// Get single key by ID
app.get('/api/keys/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM keys WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching key:', err);
    res.status(500).json({ error: 'Failed to fetch key' });
  }
});

// Add new key(s) - bulk or single
app.post('/api/keys', async (req, res) => {
  try {
    const keys = Array.isArray(req.body) ? req.body : [req.body];
    const addedKeys = [];
    
    for (const key of keys) {
      const {
        code,
        product,
        type = 'Day',
        status = 'available',
        assigned_to = '',
        reason = '',
        date = null,
        assigned_by = '',
        history = []
      } = key;
      
      if (!code || !product) {
        continue; // Skip invalid entries
      }
      
      const id = key.id || uid();
      
      const result = await pool.query(
        `INSERT INTO keys (id, code, product, type, status, assigned_to, reason, date, assigned_by, history)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (code) DO NOTHING
         RETURNING *`,
        [id, code, product, type, status, assigned_to, reason, date, assigned_by, JSON.stringify(history)]
      );
      
      if (result.rows.length > 0) {
        addedKeys.push(result.rows[0]);
      }
    }
    
    res.status(201).json(addedKeys);
  } catch (err) {
    console.error('Error adding keys:', err);
    res.status(500).json({ error: 'Failed to add keys' });
  }
});

// Update key
app.patch('/api/keys/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = ['code', 'product', 'type', 'status', 'assigned_to', 'reason', 'date', 'assigned_by', 'history'];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        // Special handling for history (JSONB)
        values.push(key === 'history' ? JSON.stringify(value) : value);
        paramCount++;
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `
      UPDATE keys 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating key:', err);
    res.status(500).json({ error: 'Failed to update key' });
  }
});

// Delete key
app.delete('/api/keys/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM keys WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Key not found' });
    }
    
    res.json({ message: 'Key deleted successfully', key: result.rows[0] });
  } catch (err) {
    console.error('Error deleting key:', err);
    res.status(500).json({ error: 'Failed to delete key' });
  }
});

// Get products list
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT product FROM keys ORDER BY product'
    );
    res.json(result.rows.map(row => row.product));
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'available') as available,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned
      FROM keys
    `);
    
    const stats = result.rows[0];
    res.json({
      total: parseInt(stats.total),
      available: parseInt(stats.available),
      assigned: parseInt(stats.assigned)
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 API available at http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
