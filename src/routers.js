const ip = require('ip')

const routers = [
  {
    method: 'GET',
    path: '/',
    handler: (r, h) => {
      return `Web application is executed at ${ip.address()} (${process.env.vmName})`
    }
  }
]

module.exports = routers
