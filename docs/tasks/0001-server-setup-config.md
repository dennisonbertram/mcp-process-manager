# Task 0001: Server Setup and Configuration

## Task Description
Implement the foundational infrastructure for the Process Manager MCP server including TypeScript project setup, SQLite database initialization, configuration management, core server architecture, and essential middleware components. This task establishes the core framework that all subsequent tasks will build upon.

## Success Criteria
- [ ] TypeScript project structure created with proper tsconfig.json
- [ ] All dependencies installed with exact pinned versions
- [ ] SQLite database schema initialized with all required tables and indexes
- [ ] Configuration manager validates and loads all environment settings
- [ ] Prepared statements optimize database queries for performance
- [ ] Winston logger configured to output only to stderr (MCP compliance)
- [ ] Clean shutdown handlers implemented for graceful termination
- [ ] Periodic cleanup tasks scheduled for log retention
- [ ] All core type definitions complete and exported
- [ ] Unit tests pass for all core components (DatabaseManager, ConfigManager)
- [ ] MCP server responds correctly to initialization requests
- [ ] Stdio transport properly configured for MCP protocol compliance

## Failure Conditions
- Database schema fails to initialize or migrate
- Configuration validation rejects valid environment variables
- Logger outputs to stdout instead of stderr
- Server fails to start within 500ms
- TypeScript compilation errors or strict mode violations
- Missing dependencies or version conflicts
- Prepared statements fail to execute
- Shutdown handlers don't prevent resource leaks

## Edge Cases
- Invalid or missing environment variables
- Database file permissions issues
- Concurrent database access during initialization
- Large configuration values exceeding limits
- Command path validation with symlinks
- Logger level changes during runtime
- Periodic cleanup with very large datasets
- Server restart during database operations

## Implementation Checklist
### Project Structure
- [x] Create src/ directory structure
- [x] Initialize package.json with exact dependency versions
- [x] Configure tsconfig.json with strict TypeScript settings
- [x] Create .gitignore file (first action per guidelines)
- [ ] Setup ESLint configuration

### Database Layer
- [x] Implement DatabaseManager class with WAL mode
- [x] Create all required tables (processes, logs, errors, process_groups, metrics)
- [x] Setup database indexes for query performance
- [x] Implement prepared statements for all operations
- [x] Add transaction wrapper for atomic operations
- [x] Implement cleanupOldData method with retention logic
- [x] Add PRAGMA optimizations (wal_autocheckpoint, journal_size_limit)

### Configuration Management
- [x] Implement ConfigManager with Zod validation
- [x] Define complete configuration schema
- [x] Add environment variable parsing and type conversion
- [x] Implement command path validation with realpath checks
- [x] Add boundary checking to prevent symlink escapes

### Core Server
- [x] Implement main server entry point (src/index.ts)
- [x] Configure Winston logger for stderr-only output
- [x] Setup MCP Server with proper capabilities
- [x] Implement clean shutdown handlers (SIGINT/SIGTERM)
- [x] Add periodic cleanup scheduling
- [x] Wire all components together

### Type Definitions
- [x] Define ProcessStatus, HealthStatus, LogType, LogLevel enums
- [x] Create ProcessConfig, ProcessInfo interfaces
- [x] Define ProcessMetrics, LogEntry, ErrorEntry interfaces
- [x] Implement ProcessGroup interface
- [x] Export all types from src/types/index.ts

### Testing (TDD Approach)
- [x] Write tests for DatabaseManager initialization
- [x] Test configuration validation and loading
- [x] Verify prepared statement preparation
- [x] Test MCP server initialization response
- [x] Validate stderr-only logging
- [x] Test command path validation security
- [x] Integration test for component wiring

### Security & Performance
- [x] Ensure no secrets hardcoded in code
- [x] Validate all file paths are absolute and safe
- [x] Implement proper error handling without information leakage
- [x] Optimize database queries with indexes
- [x] Add performance benchmarks for startup time

## Dependencies
This is the foundational task with no prerequisites. All subsequent tasks (0002-0010) depend on this setup being complete and functional.

## Testing Strategy
1. **Unit Tests**: Test individual components (DatabaseManager, ConfigManager)
2. **Integration Tests**: Test component interactions and wiring
3. **MCP Protocol Tests**: Verify server responds to initialize and tools/list
4. **Performance Tests**: Benchmark startup time and database operations
5. **Security Tests**: Validate command path restrictions and input sanitization

## Expected Deliverables
- Fully functional TypeScript project structure
- Initialized SQLite database with schema
- Configurable server with environment variables
- MCP-compliant server responding to stdio transport
- Comprehensive test suite with high coverage
- Documentation of configuration options
- Performance benchmarks meeting targets

## Risk Mitigation
- Use in-memory database for tests to avoid file system issues
- Implement graceful degradation for optional features
- Add extensive logging for debugging initialization issues
- Validate all assumptions with runtime checks
- Use TypeScript strict mode to catch type errors early