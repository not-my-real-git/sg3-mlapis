const Hapi = require('@hapi/hapi')
const routers = require('./routers')

async function init () {
  const myServer = Hapi.server({
    port: 8081,
    host: 'localhost',
    routes: {
      cors: {
        origin: ['*']
      }
    }
  })

  myServer.route(routers)
  await myServer.start()
  console.log(`Server is listening at ${myServer.info.uri}`)
}

init()
