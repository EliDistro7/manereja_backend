const User = require("../../models/manereja/user.js");

module.exports = function cashflowEvents(io, socket, userSockets) {
  // Helper function to get user by ID
  const getUserById = async (userId) => {
    try {
      const user = await User.findById(userId);
      return user;
    } catch (err) {
      console.error("Error fetching user:", err);
      return null;
    }
  };

  // Helper function to notify specific user via Socket.io
  const notifyUser = async (userId, event, eventData) => {
    console.log('Sending event to user:', userId, 'Event:', event);
    console.log('Event data:', eventData);
    const targetSocketId = userSockets[userId];
    console.log('Target socket:', targetSocketId);
    
    if (targetSocketId) {
      console.log('Successfully sent event to user');
      io.to(targetSocketId).emit(event, eventData);
    } else {
      console.log('User socket not found for userId:', userId);
    }
  };

  // Helper function to validate cashflow request data
  const validateCashflowRequest = (requestData) => {
    const { userId, businessName, period, year, month, quarter } = requestData;
    
    if (!userId || !businessName || !period || !year) {
      return { isValid: false, message: "Missing required fields" };
    }

    if (period === 'monthly' && !month) {
      return { isValid: false, message: "Month is required for monthly period" };
    }

    if (period === 'quarterly' && !quarter) {
      return { isValid: false, message: "Quarter is required for quarterly period" };
    }

    const validPeriods = ['monthly', 'quarterly', 'yearly'];
    if (!validPeriods.includes(period)) {
      return { isValid: false, message: "Invalid period type" };
    }

    return { isValid: true };
  };

  // Function to send cashflow response (to be called from external service)
  const sendCashflowResponse = (userId, cashflowData) => {
    notifyUser(userId, "cashflow_response", {
      ...cashflowData,
      message: "Cashflow statement generated successfully"
    });
  };

  // Function to send cashflow error (to be called from external service)
  const sendCashflowError = (userId, error, requestId) => {
    notifyUser(userId, "cashflow_error", {
      message: error || "Failed to generate cashflow statement",
      requestId: requestId,
      timestamp: new Date().toISOString()
    });
  };

  // Listen for 'request_cashflow' event
  socket.on("request_cashflow", async (requestData) => {
    try {
      console.log("Handling request_cashflow event...", requestData);
      console.log('user sockets when sending cashflow request', userSockets);

      // Validate request data
      const validation = validateCashflowRequest(requestData);
      if (!validation.isValid) {
        console.error("Invalid cashflow request:", validation.message);
        
        notifyUser(requestData.userId, "cashflow_error", {
          message: validation.message,
          requestId: requestData.requestId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Verify user exists
      const user = await getUserById(requestData.userId);
      if (!user) {
        console.error("User not found:", requestData.userId);
        
        notifyUser(requestData.userId, "cashflow_error", {
          message: "User not found",
          requestId: requestData.requestId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`Processing cashflow request for user: ${user.businessName}`);

      // Send acknowledgment that request was received
      notifyUser(requestData.userId, "cashflow_request_received", {
        message: "Cashflow request received and is being processed",
        requestId: requestData.requestId,
        timestamp: new Date().toISOString(),
        businessName: requestData.businessName,
        period: requestData.period,
        year: requestData.year,
        month: requestData.month,
        quarter: requestData.quarter
      });

      // Send request to the same user to generate raw data on their frontend
      // The frontend will use PDFService.generateCashFlowRawData() and send back the result
      setTimeout(() => {
        notifyUser(requestData.userId, "generate_cashflow_data", {
          requestId: requestData.requestId,
          senderId: requestData.senderId, // Who sent the request
          originalRequesterId: requestData.userId, // Who originally requested
          businessName: requestData.businessName,
          period: requestData.period,
          year: requestData.year,
          month: requestData.month,
          quarter: requestData.quarter,
          timestamp: new Date().toISOString()
        });
      }, 500); // Small delay to ensure acknowledgment is sent first

    } catch (err) {
      console.error("Error handling request_cashflow event:", err);
      
      // Send error response to user
      notifyUser(requestData.senderId, "cashflow_error", {
        message: "Internal server error while processing cashflow request",
        requestId: requestData.requestId,
        timestamp: new Date().toISOString()
      });
    }
  });

  // NEW: Listen for 'generate_cashflow_data' event - Command frontend to generate raw data
  socket.on("generate_cashflow_data", async (requestData) => {
    try {
      console.log("Handling generate_cashflow_data command...", requestData);

      const { userId, userName, period, year, month, quarter, requestId } = requestData;

      // Validate required fields
      if (!userId || !period || !requestId) {
        console.error("Invalid generate cashflow data request:", requestData);
        
        notifyUser(userId, "cashflow_error", {
          message: "Missing required fields for cashflow data generation",
          requestId: requestId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Verify user exists
      const user = await getUserById(userId);
      if (!user) {
        console.error("User not found:", userId);
        
        notifyUser(userId, "cashflow_error", {
          message: "User not found",
          requestId: requestId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`Commanding frontend cashflow data generation for user: ${user.username}`);

      // Send command to frontend to generate raw cashflow data
      notifyUser(userId, "generate_raw_cashflow_data", {
        requestId: requestId,
        userId: userId,
        senderId: requestData.senderId , // Who sent the command
        userName: userName || user.username,
        period: period,
        year: year,
        month: month,
        quarter: quarter,
        timestamp: new Date().toISOString(),
        message: "Generate cashflow raw data on frontend"
      });

    } catch (err) {
      console.error("Error handling generate_cashflow_data command:", err);
      
      // Send error response to user
      notifyUser(requestData.userId, "cashflow_error", {
        message: "Internal server error while commanding cashflow data generation",
        requestId: requestData.requestId,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Listen for 'successfully_generated_cashflow_raw_data' event from frontend
  socket.on("successful_generation_cashflow_data", async (responseData) => {
    try {
      console.log("Received generated cashflow raw data:", responseData);

      const { 
        requestId, 
        originalRequesterId, 
        userId,
        senderId,
        rawData, 
        businessName, 
        period, 
        year, 
        month, 
        quarter 
      } = responseData;

      // Validate response data
      if (!requestId || !userId || !rawData) {
        console.error("Invalid raw data response:", responseData);
        
        const targetUserId = senderId;
        notifyUser(targetUserId, "cashflow_error", {
          message: "Invalid raw data response from generator",
          requestId: requestId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`Successfully received raw cashflow data for user: ${userId}`);

      // Send the processed raw data back to the requesting user
      const targetUserId = senderId;
      sendCashflowResponse(targetUserId, {
        requestId: requestId,
        userId: userId,
        senderId: senderId,
        businessName: businessName,
        period: period,
        year: year,
        month: month,
        quarter: quarter,
        rawData: rawData,
        generatedAt: new Date().toISOString(),
        dataCount: responseData.dataCount || {}
      });

      console.log(`Cashflow raw data successfully sent to user: ${targetUserId}`);

    } catch (err) {
      console.error("Error handling successfully_generated_cashflow_raw_data event:", err);
      
      // Send error response if we have the original requester info
      const targetUserId = responseData?.originalRequesterId || responseData?.userId;
      if (targetUserId) {
        sendCashflowError(
          targetUserId, 
          "Error processing generated raw data",
          responseData.requestId
        );
      }
    }
  });

  // Listen for 'cashflow_raw_data_generation_error' event from frontend
  socket.on("cashflow_raw_data_generation_error", async (errorData) => {
    try {
      console.log("Received cashflow raw data generation error:", errorData);

      const { requestId, originalRequesterId, userId, error } = errorData;

      // Forward error to original requester or the user who generated the error
      const targetUserId = originalRequesterId || userId;
      if (targetUserId) {
        sendCashflowError(
          targetUserId, 
          error || "Failed to generate cashflow raw data on client",
          requestId
        );
        
        console.log(`Cashflow generation error sent to user: ${targetUserId}`);
      }

    } catch (err) {
      console.error("Error handling cashflow_raw_data_generation_error event:", err);
    }
  });

  // Listen for 'cashflow_status' event (optional - for checking request status)
  socket.on("cashflow_status", async ({ userId, requestId }) => {
    try {
      console.log("Checking cashflow status for:", { userId, requestId });

      // You can implement actual status checking logic here
      notifyUser(userId, "cashflow_status_response", {
        requestId,
        status: "processing",
        message: "Cashflow request is being processed",
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error("Error handling cashflow_status event:", err);
      
      notifyUser(userId, "cashflow_status_response", {
        requestId,
        status: "error",
        message: "Failed to check request status",
        timestamp: new Date().toISOString()
      });
    }
  });

  // NEW: Helper function to trigger cashflow data generation from external services
  const triggerCashflowDataGeneration = (params) => {
    const { userId, userName, period, year, month, quarter, requestId } = params;
    
    const requestData = {
      userId,
      userName,
      period,
      year,
      month,
      quarter,
      requestId: requestId || `cashflow_${Date.now()}_${userId}`,
      timestamp: new Date().toISOString()
    };

    console.log("Triggering cashflow data generation:", requestData);
    
    // Emit the generate command to the specific user
    notifyUser(userId, "generate_raw_cashflow_data", requestData);
    
    return requestData.requestId;
  };

  // Return utility functions for external services to use
  return {
    validateCashflowRequest,
    sendCashflowResponse,
    sendCashflowError,
    notifyUser,
    triggerCashflowDataGeneration // NEW: Export the trigger function
  };
};