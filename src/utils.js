const aws = require('aws-sdk')
const { equals, map, merge, not, toPairs } = require('ramda')

/**
 * Get AWS clients
 * @param {object} credentials
 * @param {string} region
 * @returns {object} AWS clients
 */
const getClients = (credentials, region = 'us-east-1') => {
  const cloudformation = new aws.CloudFormation({ credentials, region })
  return {
    cloudformation
  }
}

/**
 * Fetches previously deployed stack
 * @param {object} cloudformation cloudformation client
 * @param {object} config config object
 * @returns {object} stack and info if stack needs to be updated
 */
const getStack = async (cloudformation, config) => {
  let stack = null

  try {
    const { Stacks } = await cloudformation
      .describeStacks({ StackName: config.stackName })
      .promise()
    stack = Stacks[0]
  } catch(error) {
    if (!error.message.includes('does not exist')) {
      throw new Error(error)
    }
  }

  return stack
}

/**
 * Creates or updates the CloudFormation stack
 * @param {object} cloudformation
 * @param {object} config
 * @param {boolean} exists info if stack is already deployes
 * @returns {array} stack outputs
 */
const createOrUpdateStack = async (cloudformation, config, previousStack) => {
  let params = {
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
    )
  }

  params = merge(params, { TemplateBody: JSON.stringify(config.template) })

  if (!previousStack) {
    await cloudformation
      .createStack(merge(params, { DisableRollback: config.disableRollback }))
      .promise()
  } else {
    try {
      await cloudformation.updateStack(params).promise()
    } catch (error) {
      if (error.message !== 'No updates are to be performed.') {
        throw error
      }
    }
  }

  return await getStack(cloudformation, config)
}

/**
 * Deletes the stack
 * @param {object} cloudformation
 * @param {object} config
 * @returns {object}
 */
const deleteStack = async (cloudformation, config) => {
  try {
    await cloudformation.deleteStack({ StackName: config.stackName }).promise()
  } catch (error) {
    if (error.message !== `Stack with id ${config.stackName} does not exist`) {
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

/**
 * Waits CloudFormation stack to reach certain event
 * @param {object} cloudformation
 * @param {RegExp} successEvent event regexp to wait for
 * @param {RegExp} failureEvent event regexp which throws error
 * @param {object} config
 * @returns {array} stack outputs
 */
// const waitFor = async (cloudformation, successEvent, failureEvent, config) =>
//   new Promise(async (resolve, reject) => {
//     const inProgress = true
//     do {
//       try {
//         await utils.sleep(5000)
//         const { Stacks } = await cloudformation
//           .describeStacks({ StackName: config.stackName })
//           .promise()
//         const stackStatus = head(Stacks).StackStatus
//         if (successEvent.test(stackStatus)) {
//           return resolve(Stacks)
//         } else if (failureEvent.test(stackStatus)) {
//           return reject(new Error(`CloudFormation failed with status ${stackStatus}`))
//         }
//       } catch (error) {
//         return reject(error)
//       }
//     } while (inProgress)
//   })

module.exports = {
  createOrUpdateStack,
  deleteStack,
  getClients,
  getStack,
  updateTerminationProtection,
}
