const aws = require('aws-sdk')
const { isNil } = require('ramda')

const getClients = (credentials, region = 'us-east-1') => {
  const cloudformation = new aws.CloudFormation({ credentials, region })
  const s3 = new aws.S3({ credentials, region })
  return {
    cloudformation,
    s3
  }
}

const createOrUpdateStack = async (cloudformation, inputs) => {
  console.log(cloudformation, inputs)
  return
}

module.exports = { createOrUpdateStack, getClients }
