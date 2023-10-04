const tf = require('@tensorflow/tfjs-node')
const { Storage } = require('@google-cloud/storage')
const mysql = require('promise-mysql')
const fs = require('fs')
const { nanoid } = require('nanoid')

const INSTANCECON = 'sg3-demos:asia-southeast2:ml-database'
const UNIX = true
const DATABASE = 'logs'
const PASSWORD = 'ml-database'
const BUCKET = 'ml-storage-logs'

async function SQLQuery ({ pool, query, withLogs = true }) {
  let value = 0
  try {
    value = await pool.query(query)
  } catch (err) {
    if (withLogs) {
      function writeFancy (j) {
        let initStr = '+'
        for (let i = 0; i < j; i++) { initStr += '=' }
        console.log(initStr + '+')
      }
      writeFancy(err.message.length)
      console.log(err.message)
      writeFancy(err.message.length)
    }
    value = '--err--'
  }
  return value
}

async function initSQL () {
  const SQLConnectionConfig = {
    user: 'root',
    password: PASSWORD,
    database: DATABASE
  }
  let pool = 0

  if (UNIX) {
    pool = await mysql.createPool({
      ...SQLConnectionConfig,
      socketPath: `/cloudsql/${INSTANCECON}`
    })
  } else {
    pool = await mysql.createPool({
      ...SQLConnectionConfig,
      host: '127.0.0.1',
      port: '3306'
    })
  }
  return pool
}

async function predictSimilarity (img0, img1, threshold) {
  const model = await tf.loadGraphModel('file://src/tfjs-20230919T191458Z-001/tfjs/model.json')
  let result = model.predict([img0, img1])
  result = await result.data()

  const statusObj = {}
  if (result[0] > threshold) {
    statusObj.similarity = 'Not Similar'
  } else {
    statusObj.similarity = 'Similar'
  }
  statusObj.threshold = threshold
  statusObj.distance_score = parseFloat(result[0].toFixed(5))
  return statusObj
}

async function predictionHandler (req, h) {
  const _pool = await initSQL()
  const { threshold = 0.5, save = '0', email = 'no-email' } = req.query
  console.log(email)
  const files = req.payload

  const execTime = new Date().toISOString()
  const unique = nanoid(8)

  const buffer0 = new Uint8Array(files.file0)
  const buffer1 = new Uint8Array(files.file1)

  if (save === '1') {
    console.log('Accessing Cloud Storage.')
    const storage = new Storage({ projectId: 'sg3-demos' })
    const myBucket = storage.bucket(BUCKET)

    await myBucket.file(`${email}/${unique}/pic0.jpg`).save(files.file0)
    await myBucket.file(`${email}/${unique}/pic1.jpg`).save(files.file1)

    if (email !== 'no-email') {
      try {
        await myBucket.file(`${email}/${unique}/pic0.jpg`)
          .acl.readers.addUser(`${email}`)
      } catch (err) {
        await myBucket.deleteFiles({ prefix: email })
        return h.response({
          status: 'fail',
          message: `${email} does not exist! Process terminated`
        })
      }
      await myBucket.file(`${email}/${unique}/pic1.jpg`)
        .acl.readers.addUser(`${email}`)
    }
  }

  fs.writeFile('test.txt', buffer0, (err) => { if (err) console.log(err) })

  let tensor0 = tf.node.decodeImage(buffer0, 3, 'int32', true).resizeBilinear([120, 120])
  let tensor1 = tf.node.decodeImage(buffer1, 3, 'int32', true).resizeBilinear([120, 120])

  tensor0 = tf.div(tensor0, 255.0)
  tensor1 = tf.div(tensor1, 255.0)

  tensor0 = tf.expandDims(tensor0, 0)
  tensor1 = tf.expandDims(tensor1, 0)

  const predictionStatus = await predictSimilarity(tensor0, tensor1, parseFloat(threshold))

  await SQLQuery({
    pool: _pool,
    query: `CREATE TABLE requestlogs (email varchar(50), save_status INT, date varchar(30), 
    unique_id varchar(20), threshold FLOAT(10), prediction FLOAT(10))`,
    withLogs: false
  })
  await SQLQuery({
    pool: _pool,
    query: `INSERT INTO requestlogs VALUES ('${email}', ${save}, '${execTime}', '${unique}', ${predictionStatus.threshold}, ${predictionStatus.distance_score})`
  })

  return h.response({
    ...predictionStatus,
    GCP_logs: {
      unique_id: unique,
      authenticated_url_pic0: `https://storage.cloud.google.com/${BUCKET}/${email}/${unique}/pic0.jpg`,
      authenticated_url_pic1: `https://storage.cloud.google.com/${BUCKET}/${email}/${unique}/pic0.jpg`,
      specific_email_access: email
    }
  }).code(200)
}

async function logsRetrieveMethod (req, h) {
  const _pool = await initSQL()
  const data = await SQLQuery({ pool: _pool, query: 'SELECT * from requestlogs' })
  let put = 0
  let err = 0

  if (data === '--err--') {
    put = { status: 'fail', message: 'failed to retrieve logs.' }
    err = 500
  } else {
    put = { status: 'success', message: 'successfully retrieved logs.' }
    err = 200
  }

  return h.response({
    ...put,
    logs: data
  }).code(err)
}

module.exports = {
  predict: {
    Predict: predictionHandler,
    LogsRetrieve: logsRetrieveMethod
  }
}
