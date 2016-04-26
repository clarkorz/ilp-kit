'use strict'

const _ = require('lodash')
const Ledger = require('../lib/ledger')
const Auth = require('../lib/auth')
const Config = require('../lib/config')
const PaymentFactory = require('../models/payment')
const UserFactory = require('../models/user')

module.exports = NotificationsControllerFactory

NotificationsControllerFactory.constitute = [Ledger, Auth, PaymentFactory, UserFactory, Config]
function NotificationsControllerFactory (ledger, Auth, Payment, User, Config) {
  return class NotificationsController {
    static init (router) {
      router.post('/notifications', this.postResource)
    }

    static * postResource () {
      const notification = this.body
      const transfer = notification.resource

      // Only handle executed payments for now
      if (transfer.state !== 'executed') {
        this.body = {'status': 'OK'}
        return
      }

      const debit = transfer.debits[0]
      const credit = transfer.credits[0]
      const additionalInfo = transfer.additional_info

      let paymentObj = {
        transfers: transfer.id,
        source_account: (additionalInfo && additionalInfo.source_account) || debit.account,
        destination_account: (additionalInfo && additionalInfo.destination_account) || credit.account,
        source_amount: (additionalInfo && additionalInfo.source_amount) || debit.amount,
        destination_amount: (additionalInfo && additionalInfo.destination_amount) || credit.amount
      };

      const creditMemo = credit.memo

      // Message
      if (creditMemo) {
        if (creditMemo.userMemo) {
          paymentObj.message = creditMemo.userMemo
        }

        else if (creditMemo.destination_transfer && creditMemo.destination_transfer.credits[0].memo && creditMemo.destination_transfer.credits[0].memo.userMemo) {
          paymentObj.message = creditMemo.destination_transfer.credits[0].memo.userMemo
        }
      }

      // TODO move this logic somewhere else
      // Source user
      if (_.startsWith(debit.account, Config.data.getIn(['ledger', 'public_uri']) + '/accounts/')) {
        let user = yield User.findOne({where: {username: debit.account.slice(Config.data.getIn(['ledger', 'public_uri']).length + 10)}})
        if (user) {
          paymentObj.source_user = user.id
        }
      }

      // Destination user
      if (_.startsWith(credit.account, Config.data.getIn(['ledger', 'public_uri']) + '/accounts/')) {
        let user = yield User.findOne({where: {username: credit.account.slice(Config.data.getIn(['ledger', 'public_uri']).length + 10)}})
        if (user) {
          paymentObj.destination_user = user.id
        }
      }

      // Create the payment object
      let payment = new Payment()
      payment.setDataExternal(paymentObj)

      try {
        yield payment.create()
      } catch(e) {
        // TODO handle
      }

      ledger.emitTransferEvent(transfer)

      this.body = {'status': 'OK'}
    }
  }
}
