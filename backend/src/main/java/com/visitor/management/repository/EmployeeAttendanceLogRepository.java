package com.visitor.management.repository;

import com.visitor.management.entity.EmployeeAttendanceLog;
import com.visitor.management.entity.EmployeeAttendanceState;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface EmployeeAttendanceLogRepository extends MongoRepository<EmployeeAttendanceLog, String> {
    Optional<EmployeeAttendanceLog> findTopByEmployeeUserIdAndStateOrderByCheckInTimeDesc(String employeeUserId, EmployeeAttendanceState state);

    Optional<EmployeeAttendanceLog> findTopByEmployeeUserIdAndAttendanceDateOrderByCreatedAtDesc(String employeeUserId, LocalDate attendanceDate);

    List<EmployeeAttendanceLog> findTop100ByOrganizationIdOrderByCreatedAtDesc(String organizationId);

    List<EmployeeAttendanceLog> findTop100ByOrderByCreatedAtDesc();

    List<EmployeeAttendanceLog> findTop60ByEmployeeUserIdOrderByCreatedAtDesc(String employeeUserId);

    List<EmployeeAttendanceLog> findAllByOrganizationIdAndAttendanceDate(String organizationId, LocalDate attendanceDate);
}
