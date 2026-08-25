import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

db.on('error', error => {
  console.error('MySQL pool error:', error.message)
})

const getConnection = async () => {
  try {
    const connection = await db.getConnection()
    console.log('✅Database connection established successfully')
    return connection
  } catch (error) {
    console.error('❌Failed to connect to MySQL:', error.message)
    throw error
  }
}

getConnection()

export default db
