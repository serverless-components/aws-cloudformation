const aws = require('aws-sdk')
const { reduce, head, isNil, equals, map, merge, not, toPairs } = require('ramda')
const { utils } = require('@serverless/core')

/**
 * Get AWS clients
 * @param {object} credentials
 * @param {string} region
 * @returns {object} AWS clients
 */
const getClients = (credentials, region = 'us-east-1') => {
  const cloudformation = new aws.CloudFormation({ credentials, region })
  const s3 = new aws.S3({ credentials, region })
  return {
    cloudformation,
    s3
  }
}

/**
 * Waits CloudFormation stack to reach certain event
 * @param {object} cloudformation
 * @param {string} event event to wait for
 * @param {object} config
 * @returns {array} stack outputs
 */
const waitFor = async (cloudformation, event, config) =>
  new Promise(async (resolve, reject) => {
    const inProgress = true
    do {
      try {
        const { Stacks } = await cloudformation
          .describeStacks({ StackName: config.stackName })
          .promise()
        if (head(Stacks).StackStatus === event) {
          return resolve(Stacks)
        }
        await utils.sleep(5000)
      } catch (error) {
        return reject(error)
      }
    } while (inProgress)
  })

/**
 * Fetches previously deployed stack
 * @param {object} cloudformation cloudformation client
 * @param {object} config config object
 * @returns {object} stack and info if stack needs to be updated
 */
const getPreviousStack = async (cloudformation, config) => {
  let previousTemplate
  let stack

  try {
    previousTemplate = await cloudformation
      .getTemplate({ StackName: config.stackName, TemplateStage: 'Original' })
      .promise()
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }

  if (isNil(previousTemplate)) {
    return {
      stack: {},
      needsUpdate: true
    }
  }

  try {
    const { Stacks } = await cloudformation
      .describeStacks({ StackName: config.stackName })
      .promise()
    stack = head(Stacks)
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }

  const previousParameters = reduce(
    (acc, { ParameterKey, ParameterValue }) => merge(acc, { [ParameterKey]: ParameterValue }),
    {},
    stack.Parameters
  )

  if (
    equals(previousTemplate.TemplateBody, JSON.stringify(config.template)) &&
    equals(previousParameters, config.parameters)
  ) {
    return {
      stack,
      needsUpdate: false
    }
  }

  return {
    stack,
    needsUpdate: true
  }
}

/**
 * Constructs S3 key for CloudFormation template
 * @param {object} config
 * @returns {string} key
 */
const constructTemplateS3Key = (config) => {
  return `${config.stackName}/${config.timestamp}-${new Date(
    config.timestamp
  ).toISOString()}/template.json`
}

/**
 * Uploads template to S3 bucket
 * @param {object} s3
 * @param {object} config
 */
const uploadTemplate = async (s3, config) => {
  await s3
    .putObject({
      Bucket: config.bucket,
      Key: config.templateS3Key,
      Body: JSON.stringify(config.template),
      ContentEncoding: 'application/json',
      ACL: 'bucket-owner-full-control'
    })
    .promise()
}

/**
 * Converts stack outputs to an object
 * @param {array} outputs
 * @returns {object} stack outputs
 */
const stackOutputsToObject = (outputs) =>
  reduce((acc, { OutputKey, OutputValue }) => merge(acc, { [OutputKey]: OutputValue }), {}, outputs)

/**
 * Creates or updates the CloudFormation stack
 * @param {object} cloudformation
 * @param {object} config
 * @param {boolean} exists info if stack is already deployes
 * @returns {array} stack outputs
 */
const createOrUpdateStack = async (cloudformation, config, exists) => {
  const params = {
    StackName: config.stackName,
    Capabilities: config.capabilities,
    RoleARN: config.role,
    RollbackConfiguration: config.rollbackConfiguration,
    Parameters: map(
      ([key, value]) => ({
        ParameterKey: key,
        ParameterValue: value
      }),
      toPairs(config.parameters)
    ),
    TemplateURL: `https://s3.amazonaws.com/${config.bucket}/${config.templateS3Key}`
  }
  if (not(exists)) {
    await cloudformation.createStack(params).promise()
  } else {
    try {
      await cloudformation.updateStack(params).promise()
    } catch (error) {
      if (error.message !== 'No updates are to be performed.') {
        throw error
      }
    }
  }

  const stacks = await waitFor(
    cloudformation,
    exists ? 'UPDATE_COMPLETE' : 'CREATE_COMPLETE',
    config
  )

  return stackOutputsToObject(head(stacks).Outputs)
}

/**
 * Fetches stack outputs
 * @param {*} cloudformation
 * @param {*} config
 * @returns {array} stack outputs
 */
const fetchOutputs = async (cloudformation, config) => {
  const { Stacks } = await cloudformation.describeStacks({ StackName: config.stackName }).promise()
  return stackOutputsToObject(head(Stacks).Outputs)
}

const deleteStack = async (cloudformation, config) => {
  try {
    await cloudformation.deleteStack({ StackName: config.stackName }).promise()
    return await waitFor(cloudformation, 'DELETE_COMPLETE', config)
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
      throw error
    }
  }
}

/**
 * Deletes the content of the bucket and also the bucket
 * @param {object} s3
 * @param {object} config
 */
const deleteBucket = async (s3, config) => {
  let nextToken
  try {
    do {
      const { NextContinuationToken, Contents } = await s3
        .listObjectsV2({ Bucket: config.bucket, ContinuationToken: nextToken })
        .promise()
      await s3
        .deleteObjects({
          Bucket: config.bucket,
          Delete: {
            Objects: map(({ Key, VersionId }) => ({ Key, VersionId }), Contents),
            Quiet: false
          }
        })
        .promise()
      nextToken = NextContinuationToken
    } while (not(isNil(nextToken)))
    return await s3.deleteBucket({ Bucket: config.bucket }).promise()
  } catch (error) {
    if (error.statusCode !== 404) {
      throw error
    }
  }
}

/**
 * Updates stack termination protection
 * @param {object} cloudformation
 * @param {object} config
 * @param {boolean} terminationProtectionEnabled
 */
const updateTerminationProtection = async (
  cloudformation,
  config,
  terminationProtectionEnabled
) => {
  if (not(equals(terminationProtectionEnabled, config.enableTerminationProtection))) {
    await cloudformation
      .updateTerminationProtection({
        EnableTerminationProtection: config.enableTerminationProtection,
        StackName: config.stackName
      })
      .promise()
  }
}

module.exports = {
  getPreviousStack,
  fetchOutputs,
  deleteStack,
  deleteBucket,
  createOrUpdateStack,
  constructTemplateS3Key,
  getClients,
  uploadTemplate,
  updateTerminationProtection
}
