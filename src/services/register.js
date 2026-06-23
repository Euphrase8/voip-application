import axios from "axios";
import { CONFIG } from './config';

const API_URL = CONFIG.API_URL;

export const register = async (username, email, password, extension) => {
  try {
    if (!username || !email || !password) {
      return {
        success: false,
        message: "Username, email, and password are required",
      };
    }

    console.log('[register.js] Attempting registration for:', { username, email });

    const payload = { username, email, password };
    if (extension) {
      payload.extension = extension;
    }

    const response = await axios.post(`${API_URL}/api/register`, payload);

    const { message, user } = response.data;

    console.log('[register.js] Registration successful:', user);
    return {
      success: true,
      message: message || "Registered successfully",
      extension: user.extension,
      user: user,
    };
  } catch (error) {
    let message = "Registration failed. Please try again.";

    if (error.response) {
      const status = error.response.status;
      const errorMsg = error.response.data.error || error.response.data.message;

      if (status === 400) {
        switch (errorMsg) {
          case "Invalid input":
          case "Invalid username":
          case "Invalid email":
            message = "Invalid username or email. Username must be a 4-6 digit extension.";
            break;
          case "Duplicate username":
          case "Duplicate email":
            message = "Username or email already registered. Try a different one.";
            break;
          case "Invalid role":
            message = "Invalid role. Choose user, admin, faculty, or emergency.";
            break;
          default:
            message = errorMsg || "Invalid registration details.";
        }
      } else if (status === 500) {
        switch (errorMsg) {
          case "Database error":
          case "Could not create user":
            message = "Failed to save user data. Try again later.";
            break;
          case "Failed to update Asterisk configuration":
            message = "Failed to configure VoIP settings. Contact support.";
            break;
          case "SSH configuration missing":
            message = "Server configuration error. Contact support.";
            break;
          default:
            message = errorMsg || "Server error during registration.";
        }
      } else {
        message = errorMsg || "Unexpected registration error.";
      }
    } else if (error.request) {
      message = "No response from server. Check your network connection.";
    } else {
      message = `Registration error: ${error.message}`;
    }

    console.error("[register.js] Registration error:", {
      message,
      status: error.response?.status,
      data: error.response?.data,
    });

    return {
      success: false,
      message,
    };
  }
};