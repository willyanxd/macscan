import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface Job {
  id: string;
  name: string;
  network_interface: string;
  subnet: string;
  execution_time: number;
  schedule: string;
  notifications_enabled: boolean;
  retention_policy: string;
  retention_days: number;
  status: 'active' | 'inactive' | 'running';
  created_at: string;
  last_run: string | null;
  next_run: string | null;
}

interface Notification {
  id: string;
  job_id: string;
  job_name: string;
  type: 'information' | 'warning';
  message: string;
  mac_address: string;
  ip_address: string;
  created_at: string;
  read: boolean;
}

interface AppState {
  jobs: Job[];
  notifications: Notification[];
  loading: boolean;
  networkInterfaces: string[];
}

interface AppContextType extends AppState {
  fetchJobs: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  fetchNetworkInterfaces: () => Promise<void>;
  markNotificationAsRead: (id: string) => Promise<void>;
  runJob: (id: string) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialState: AppState = {
  jobs: [],
  notifications: [],
  loading: false,
  networkInterfaces: []
};

type Action = 
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_JOBS'; payload: Job[] }
  | { type: 'SET_NOTIFICATIONS'; payload: Notification[] }
  | { type: 'SET_NETWORK_INTERFACES'; payload: string[] }
  | { type: 'UPDATE_JOB'; payload: Job }
  | { type: 'DELETE_JOB'; payload: string }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'DELETE_NOTIFICATION'; payload: string };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_JOBS':
      return { ...state, jobs: action.payload };
    case 'SET_NOTIFICATIONS':
      return { ...state, notifications: action.payload };
    case 'SET_NETWORK_INTERFACES':
      return { ...state, networkInterfaces: action.payload };
    case 'UPDATE_JOB':
      return {
        ...state,
        jobs: state.jobs.map(job => 
          job.id === action.payload.id ? action.payload : job
        )
      };
    case 'DELETE_JOB':
      return {
        ...state,
        jobs: state.jobs.filter(job => job.id !== action.payload)
      };
    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(notification =>
          notification.id === action.payload 
            ? { ...notification, read: true }
            : notification
        )
      };
    case 'DELETE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(notification =>
          notification.id !== action.payload
        )
      };
    default:
      return state;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const fetchJobs = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await api.get('/jobs');
      dispatch({ type: 'SET_JOBS', payload: response.data });
    } catch (error) {
      toast.error('Failed to fetch jobs');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      dispatch({ type: 'SET_NOTIFICATIONS', payload: response.data });
    } catch (error) {
      toast.error('Failed to fetch notifications');
    }
  };

  const fetchNetworkInterfaces = async () => {
    try {
      const response = await api.get('/network/interfaces');
      dispatch({ type: 'SET_NETWORK_INTERFACES', payload: response.data });
    } catch (error) {
      toast.error('Failed to fetch network interfaces');
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id });
    } catch (error) {
      toast.error('Failed to mark notification as read');
    }
  };

  const runJob = async (id: string) => {
    try {
      await api.post(`/jobs/${id}/run`);
      toast.success('Job started successfully');
      fetchJobs();
    } catch (error) {
      toast.error('Failed to start job');
    }
  };

  const deleteJob = async (id: string) => {
    try {
      await api.delete(`/jobs/${id}`);
      dispatch({ type: 'DELETE_JOB', payload: id });
      toast.success('Job deleted successfully');
    } catch (error) {
      toast.error('Failed to delete job');
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchNotifications();
    fetchNetworkInterfaces();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      fetchJobs();
      fetchNotifications();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const contextValue: AppContextType = {
    ...state,
    fetchJobs,
    fetchNotifications,
    fetchNetworkInterfaces,
    markNotificationAsRead,
    runJob,
    deleteJob
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}