// socket/events/orderEvents.js
const Order = require('../../models/manereja/order');
const SalesItem = require('../../models/manereja/sales-item');
const User = require('../../models/manereja/user.js');

// ✅ FIX: signature now accepts all 5 args to match socket.js call
module.exports = function orderEvents(io, socket, userSockets, roomSocketsMap, socketToUser) {

  // ==========================================
  // CREATE ORDER (Buyer places order)
  // ==========================================
  socket.on('create_order', async (orderData) => {
    try {
      const {
        buyerId, buyerName, buyerPhone, buyerEmail,
        sellerId, sellerName, items, fulfillmentMethod,
        deliveryLocation, pickupLocation, deliveryAddress,
        deliveryInstructions, paymentMethod, subtotal,
        deliveryFee, taxAmount, discountAmount, totalAmount, notes,
      } = orderData;

      if (!buyerId || !sellerId || !items || items.length === 0) {
        socket.emit('order_error', { error: 'Missing required order fields' });
        return;
      }

      const orderNumber = generateOrderNumber();

      const newOrder = new Order({
        orderNumber, buyerId, buyerName, buyerPhone, buyerEmail,
        sellerId, sellerName, items,
        status: 'pending', fulfillmentMethod, deliveryLocation,
        pickupLocation, deliveryAddress, deliveryInstructions,
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: 'unpaid', subtotal,
        deliveryFee: deliveryFee || 0,
        taxAmount: taxAmount || 0,
        discountAmount: discountAmount || 0,
        totalAmount, amountPaid: 0, amountDue: totalAmount,
        statusHistory: [{
          status: 'pending', timestamp: new Date(),
          note: 'Order created', updatedBy: buyerId,
        }],
        notes, createdAt: new Date(), updatedAt: new Date(),
      });

      await newOrder.save();
      await newOrder.populate('buyerId', 'name email profilePicture phoneNumber');
      await newOrder.populate('sellerId', 'name email profilePicture phoneNumber');

      const formattedOrder = formatOrder(newOrder);

      // Notify buyer
      socket.emit('order_created', {
        order: formattedOrder,
        message: 'Order placed successfully',
      });

      // ✅ FIX: notify seller via Set-based emitToUser
      emitToUser(sellerId, 'new_order_received', {
        order: formattedOrder,
        message: `New order #${orderNumber} from ${buyerName}`,
      });

    } catch (error) {
      console.error('❌ Error creating order:', error);
      socket.emit('order_error', { error: 'Failed to create order' });
    }
  });

  // ==========================================
  // GET BUYER ORDERS
  // ==========================================
  socket.on('get_buyer_orders', async ({ buyerId, status, limit = 50 }) => {
    try {
      if (!buyerId) {
        socket.emit('order_error', { error: 'Buyer ID required' });
        return;
      }

      const query = { buyerId, isDeleted: false };
      if (status) query.status = status;

      const orders = await Order.find(query)
        .populate('buyerId', 'name email profilePicture')
        .populate('sellerId', 'name email profilePicture')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      socket.emit('buyer_orders_list', {
        orders: orders.map(formatOrder),
        count: orders.length,
      });

    } catch (error) {
      console.error('❌ Error fetching buyer orders:', error);
      socket.emit('order_error', { error: 'Failed to fetch orders' });
    }
  });

  // ==========================================
  // GET SELLER ORDERS
  // ==========================================
  socket.on('get_seller_orders', async ({ sellerId, status, limit = 50 }) => {
    try {
      if (!sellerId) {
        socket.emit('order_error', { error: 'Seller ID required' });
        return;
      }

      const query = { sellerId, isDeleted: false };
      if (status) query.status = status;

      const orders = await Order.find(query)
        .populate('buyerId', 'name email profilePicture phoneNumber')
        .populate('sellerId', 'name email profilePicture')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      socket.emit('seller_orders_list', {
        orders: orders.map(formatOrder),
        count: orders.length,
      });

    } catch (error) {
      console.error('❌ Error fetching seller orders:', error);
      socket.emit('order_error', { error: 'Failed to fetch orders' });
    }
  });

  // ==========================================
  // GET SINGLE ORDER DETAILS
  // ==========================================
  socket.on('get_order_details', async ({ orderId, userId }) => {
    try {
      if (!orderId || !userId) {
        socket.emit('order_error', { error: 'Order ID and User ID required' });
        return;
      }

      const order = await Order.findById(orderId)
        .populate('buyerId', 'name email profilePicture phoneNumber')
        .populate('sellerId', 'name email profilePicture phoneNumber')
        .lean();

      if (!order) {
        socket.emit('order_error', { error: 'Order not found' });
        return;
      }

      if (order.buyerId._id.toString() !== userId &&
          order.sellerId._id.toString() !== userId) {
        socket.emit('order_error', { error: 'Unauthorized to view this order' });
        return;
      }

      socket.emit('order_details', { order: formatOrder(order) });

    } catch (error) {
      console.error('❌ Error fetching order details:', error);
      socket.emit('order_error', { error: 'Failed to fetch order details' });
    }
  });

  // ==========================================
  // UPDATE ORDER STATUS
  // ==========================================
  socket.on('update_order_status', async ({ orderId, newStatus, note, updatedBy }) => {
    try {
      if (!orderId || !newStatus || !updatedBy) {
        socket.emit('order_error', { error: 'Missing required fields' });
        return;
      }

      const order = await Order.findById(orderId)
        .populate('buyerId', 'name email profilePicture')
        .populate('sellerId', 'name email profilePicture');

      if (!order) {
        socket.emit('order_error', { error: 'Order not found' });
        return;
      }

      const validTransitions = getValidStatusTransitions(order.status);
      if (!validTransitions.includes(newStatus)) {
        socket.emit('order_error', {
          error: `Cannot change status from ${order.status} to ${newStatus}`,
        });
        return;
      }

      order.status = newStatus;
      order.updatedAt = new Date();
      order.statusHistory.push({
        status: newStatus, timestamp: new Date(),
        note: note || `Status changed to ${newStatus}`,
        updatedBy,
      });

      if (newStatus === 'confirmed' && !order.confirmedAt) order.confirmedAt = new Date();
      else if (newStatus === 'completed' && !order.completedAt) order.completedAt = new Date();
      else if (newStatus === 'cancelled' && !order.cancelledAt) order.cancelledAt = new Date();

      await order.save();
      const formattedOrder = formatOrder(order);

      // ✅ FIX: notify buyer via Set-based emitToUser
      const buyerIdStr = order.buyerId?._id?.toString() || order.buyerId?.toString();
      if (buyerIdStr) {
        emitToUser(buyerIdStr, 'order_status_updated', {
          order: formattedOrder,
          message: `Order #${order.orderNumber} is now ${newStatus}`,
        });
      }

      // ✅ FIX: notify seller if they're not the updater
      const sellerIdStr = order.sellerId?._id?.toString() || order.sellerId?.toString();
      if (sellerIdStr && sellerIdStr !== updatedBy) {
        emitToUser(sellerIdStr, 'order_status_updated', {
          order: formattedOrder,
          message: `Order #${order.orderNumber} status updated`,
        });
      }

      socket.emit('order_updated', {
        order: formattedOrder,
        message: 'Order status updated successfully',
      });

    } catch (error) {
      console.error('❌ Error updating order status:', error);
      socket.emit('order_error', { error: 'Failed to update order status' });
    }
  });

  // ==========================================
  // PROCESS PAYMENT
  // ==========================================
  socket.on('process_order_payment', async ({ orderId, amount, paymentMethod, userId }) => {
    try {
      if (!orderId || !amount || !userId) {
        socket.emit('order_error', { error: 'Missing required payment fields' });
        return;
      }

      const order = await Order.findById(orderId)
        .populate('buyerId', 'name email')
        .populate('sellerId', 'name email');

      if (!order) {
        socket.emit('order_error', { error: 'Order not found' });
        return;
      }

      const buyerIdStr = order.buyerId?._id?.toString() || order.buyerId?.toString();
      if (buyerIdStr !== userId) {
        socket.emit('order_error', { error: 'Unauthorized to make payment' });
        return;
      }

      const newAmountPaid = order.amountPaid + parseFloat(amount);
      const newAmountDue = order.totalAmount - newAmountPaid;

      order.amountPaid = newAmountPaid;
      order.amountDue = newAmountDue > 0 ? newAmountDue : 0;
      order.paymentStatus = newAmountDue <= 0 ? 'paid' : (newAmountPaid > 0 ? 'partiallyPaid' : order.paymentStatus);
      if (paymentMethod) order.paymentMethod = paymentMethod;
      order.updatedAt = new Date();
      await order.save();

      const formattedOrder = formatOrder(order);

      socket.emit('payment_processed', {
        order: formattedOrder,
        message: 'Payment processed successfully',
      });

      // ✅ FIX: notify seller via Set-based emitToUser
      const sellerIdStr = order.sellerId?._id?.toString() || order.sellerId?.toString();
      if (sellerIdStr) {
        emitToUser(sellerIdStr, 'payment_received', {
          order: formattedOrder, amount,
          message: `Payment received for order #${order.orderNumber}`,
        });
      }

    } catch (error) {
      console.error('❌ Error processing payment:', error);
      socket.emit('order_error', { error: 'Failed to process payment' });
    }
  });

  // ==========================================
  // CANCEL ORDER
  // ==========================================
  socket.on('cancel_order', async ({ orderId, reason, cancelledBy }) => {
    try {
      if (!orderId || !cancelledBy) {
        socket.emit('order_error', { error: 'Missing required fields' });
        return;
      }

      const order = await Order.findById(orderId)
        .populate('buyerId', 'name email')
        .populate('sellerId', 'name email');

      if (!order) {
        socket.emit('order_error', { error: 'Order not found' });
        return;
      }

      if (!['pending', 'confirmed'].includes(order.status)) {
        socket.emit('order_error', { error: 'Order cannot be cancelled at this stage' });
        return;
      }

      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancellationReason = reason;
      order.updatedAt = new Date();
      order.statusHistory.push({
        status: 'cancelled', timestamp: new Date(),
        note: reason || 'Order cancelled', updatedBy: cancelledBy,
      });

      await order.save();
      const formattedOrder = formatOrder(order);

      // ✅ FIX: notify both buyer and seller via Set-based emitToUser
      const buyerIdStr = order.buyerId?._id?.toString() || order.buyerId?.toString();
      if (buyerIdStr) {
        emitToUser(buyerIdStr, 'order_cancelled', {
          order: formattedOrder,
          message: `Order #${order.orderNumber} has been cancelled`,
        });
      }

      const sellerIdStr = order.sellerId?._id?.toString() || order.sellerId?.toString();
      if (sellerIdStr) {
        emitToUser(sellerIdStr, 'order_cancelled', {
          order: formattedOrder,
          message: `Order #${order.orderNumber} has been cancelled`,
        });
      }

    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      socket.emit('order_error', { error: 'Failed to cancel order' });
    }
  });

  // ==========================================
  // ADD TRACKING INFO
  // ==========================================
  socket.on('add_order_tracking', async ({ orderId, trackingNumber, estimatedDeliveryDate, userId }) => {
    try {
      if (!orderId || !trackingNumber || !userId) {
        socket.emit('order_error', { error: 'Missing required fields' });
        return;
      }

      const order = await Order.findById(orderId)
        .populate('buyerId', 'name email')
        .populate('sellerId', 'name email');

      if (!order) {
        socket.emit('order_error', { error: 'Order not found' });
        return;
      }

      if (order.sellerId._id.toString() !== userId) {
        socket.emit('order_error', { error: 'Unauthorized to add tracking' });
        return;
      }

      order.trackingNumber = trackingNumber;
      if (estimatedDeliveryDate) order.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
      order.updatedAt = new Date();
      await order.save();

      const formattedOrder = formatOrder(order);

      // ✅ FIX: notify buyer via Set-based emitToUser
      const buyerIdStr = order.buyerId?._id?.toString() || order.buyerId?.toString();
      if (buyerIdStr) {
        emitToUser(buyerIdStr, 'tracking_added', {
          order: formattedOrder,
          message: `Tracking number added for order #${order.orderNumber}`,
        });
      }

      socket.emit('tracking_updated', {
        order: formattedOrder,
        message: 'Tracking information added successfully',
      });

    } catch (error) {
      console.error('❌ Error adding tracking:', error);
      socket.emit('order_error', { error: 'Failed to add tracking' });
    }
  });

  // ==========================================
  // MARK ORDER AS REVIEWED
  // ==========================================
  socket.on('mark_order_reviewed', async ({ orderId, reviewId, userId }) => {
    try {
      if (!orderId || !reviewId || !userId) {
        socket.emit('order_error', { error: 'Missing required fields' });
        return;
      }

      const order = await Order.findById(orderId);
      if (!order) {
        socket.emit('order_error', { error: 'Order not found' });
        return;
      }

      if (order.buyerId.toString() !== userId) {
        socket.emit('order_error', { error: 'Unauthorized' });
        return;
      }

      order.isReviewed = true;
      order.reviewId = reviewId;
      order.updatedAt = new Date();
      await order.save();

      socket.emit('order_review_marked', {
        orderId: order._id,
        message: 'Order marked as reviewed',
      });

    } catch (error) {
      console.error('❌ Error marking order as reviewed:', error);
      socket.emit('order_error', { error: 'Failed to mark as reviewed' });
    }
  });

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  /**
   * ✅ FIX: emit to ALL active sockets of a user (Set-based userSockets).
   */
  function emitToUser(userId, event, data) {
    const sockets = userSockets[userId];
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }

  function generateOrderNumber() {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomSuffix = now.getTime().toString().slice(-6);
    return `ORD-${dateStr}-${randomSuffix}`;
  }

  function formatOrder(order) {
    return {
      _id: order._id?.toString(),
      id: order._id?.toString(),
      orderNumber: order.orderNumber,
      buyerId: order.buyerId?._id?.toString() || order.buyerId?.toString(),
      buyerName: order.buyerName || order.buyerId?.name,
      buyerPhone: order.buyerPhone || order.buyerId?.phoneNumber,
      buyerEmail: order.buyerEmail || order.buyerId?.email,
      sellerId: order.sellerId?._id?.toString() || order.sellerId?.toString(),
      sellerName: order.sellerName || order.sellerId?.name,
      sellerPhone: order.sellerPhone || order.sellerId?.phoneNumber,
      sellerEmail: order.sellerEmail || order.sellerId?.email,
      items: order.items,
      status: order.status,
      fulfillmentMethod: order.fulfillmentMethod,
      deliveryLocation: order.deliveryLocation,
      pickupLocation: order.pickupLocation,
      deliveryAddress: order.deliveryAddress,
      deliveryInstructions: order.deliveryInstructions,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      amountPaid: order.amountPaid,
      amountDue: order.amountDue,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      confirmedAt: order.confirmedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      cancellationReason: order.cancellationReason,
      statusHistory: order.statusHistory,
      notes: order.notes,
      isReviewed: order.isReviewed,
      reviewId: order.reviewId,
      trackingNumber: order.trackingNumber,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      actualDeliveryDate: order.actualDeliveryDate,
      buyer: order.buyerId?.name ? {
        _id: order.buyerId._id?.toString(),
        name: order.buyerId.name,
        email: order.buyerId.email,
        profilePicture: order.buyerId.profilePicture,
        phoneNumber: order.buyerId.phoneNumber,
      } : null,
      seller: order.sellerId?.name ? {
        _id: order.sellerId._id?.toString(),
        name: order.sellerId.name,
        email: order.sellerId.email,
        profilePicture: order.sellerId.profilePicture,
        phoneNumber: order.sellerId.phoneNumber,
      } : null,
    };
  }

  function getValidStatusTransitions(currentStatus) {
    const transitions = {
      'pending':    ['confirmed', 'cancelled'],
      'confirmed':  ['processing', 'cancelled'],
      'processing': ['ready', 'shipped', 'cancelled'],
      'ready':      ['delivered', 'cancelled'],
      'shipped':    ['delivered', 'cancelled'],
      'delivered':  ['completed'],
      'completed':  ['refunded'],
      'cancelled':  [],
      'refunded':   [],
    };
    return transitions[currentStatus] || [];
  }
};