import { useQuery } from '@tanstack/react-query';

import {
  getEmployeeApprovals,
  getEmployeeAttendance,
  getEmployeeBadge,
  getEmployeeNotifications,
  getEmployeeOverview,
  getEmployeePreApprovals,
  getEmployeeProfile,
} from '../services/employeeService';

export function useEmployeeOverview() {
  return useQuery({
    queryKey: ['employee', 'overview'],
    queryFn: getEmployeeOverview,
  });
}

export function useEmployeeBadge() {
  return useQuery({
    queryKey: ['employee', 'badge'],
    queryFn: getEmployeeBadge,
  });
}

export function useEmployeeApprovals() {
  return useQuery({
    queryKey: ['employee', 'approvals'],
    queryFn: getEmployeeApprovals,
  });
}

export function useEmployeePreApprovals() {
  return useQuery({
    queryKey: ['employee', 'pre-approvals'],
    queryFn: getEmployeePreApprovals,
  });
}

export function useEmployeeAttendance() {
  return useQuery({
    queryKey: ['employee', 'attendance'],
    queryFn: getEmployeeAttendance,
  });
}

export function useEmployeeNotifications() {
  return useQuery({
    queryKey: ['employee', 'notifications'],
    queryFn: getEmployeeNotifications,
  });
}

export function useEmployeeProfile() {
  return useQuery({
    queryKey: ['employee', 'profile'],
    queryFn: getEmployeeProfile,
  });
}
