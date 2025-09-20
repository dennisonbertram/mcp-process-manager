# Task 0004: Log Management Tools Implementation

## Task Description
Implement comprehensive log management tools for the MCP Process Manager. This includes log retrieval, real-time tailing, searching, and cleanup capabilities with efficient SQLite storage and streaming support.

## Success Criteria
- [ ] LogManager handles buffered writes with batch insertion
- [ ] Real-time log streaming works with subscription cleanup
- [ ] Full-text search supports wildcards and case sensitivity
- [ ] Log tailing with follow mode and timeout handling
- [ ] All 4 log tools implemented and registered via central registry
- [ ] Log statistics calculated correctly (counts by type/level)
- [ ] Old log cleanup works with timestamp filtering
- [ ] MCP compliance: tools/call returns content only
- [ ] All tests pass (15+ test cases including edge cases)
- [ ] Performance metrics met (<1ms write, <100ms search, <50MB memory)

## Failure Conditions
- Log writes fail or corrupt data
- Search queries are slow or return incorrect results
- Memory leaks from log buffering or subscriptions
- Real-time tailing doesn't work or causes hangs
- Database operations fail or cause corruption
- MCP tools don't register or respond correctly
- Log cleanup doesn't work or deletes wrong data

## Edge Cases
- Large log volumes (1M+ entries)
- Concurrent log writes from multiple processes
- Search queries with special characters or regex
- Tail subscriptions that timeout or are abandoned
- Buffer overflow during high log volume
- Database corruption or disk space issues
- Mixed log levels and types in search results
- Time-based filtering with edge timestamps

## Implementation Checklist
### Phase 1: Dependencies & Setup
- [ ] Create src/logs/ directory
- [ ] Verify database logs table exists (from Task 0001)
- [ ] Test SQLite full-text search capabilities
- [ ] Review existing log storage in database manager

### Phase 2: LogManager Implementation
- [ ] Create src/logs/manager.ts with LogManager class
- [ ] Implement buffered log writes with batch insertion
- [ ] Add event emission for real-time log streaming
- [ ] Implement log filtering and pagination
- [ ] Add full-text search with case sensitivity options
- [ ] Implement log tailing with follow mode
- [ ] Add subscription management and cleanup
- [ ] Implement log statistics calculation

### Phase 3: MCP Tools Implementation
- [ ] Create src/tools/logs.ts
- [ ] Implement 4 log tools using central registry
- [ ] Add Zod schema validation for all tool inputs
- [ ] Ensure MCP compliance (content-only responses)
- [ ] Register tools via registry system
- [ ] Add proper error handling and logging

### Phase 4: Process Manager Integration
- [ ] Update ProcessManager to use LogManager
- [ ] Modify output handlers to emit log events
- [ ] Integrate with existing log storage
- [ ] Test log capture from running processes

### Phase 5: Testing & Validation
- [ ] Create comprehensive tests (tests/logs.test.ts)
- [ ] Test buffered writes and batch insertion
- [ ] Test search functionality and performance
- [ ] Test tailing with follow mode
- [ ] Test subscription cleanup and memory management
- [ ] Validate MCP tool functionality via stdio
- [ ] Performance benchmark log operations

### Phase 6: Documentation & Cleanup
- [ ] Update task document with completion status
- [ ] Add log management examples to documentation
- [ ] Run linting and type checking
- [ ] Clean up temporary files
- [ ] Commit changes with detailed message

## Dependencies
- Task 0001 (Server Setup) - provides database with logs table
- Task 0002 (Process Lifecycle) - provides ProcessManager for integration
- SQLite database with logs table and proper indexing
- Existing log storage infrastructure

## Testing Strategy
1. **Unit Testing**: Test LogManager class in isolation
2. **Integration Testing**: Test with ProcessManager and database
3. **MCP Testing**: Test tools via stdio protocol
4. **Performance Testing**: Benchmark search and write operations
5. **Memory Testing**: Test buffer management and subscription cleanup

## Performance Requirements
- Log write: <1ms (buffered batch insertion)
- Batch flush: <50ms for 100 logs
- Search: <100ms for 100k logs (may be <350ms without FTS)
- Tail response: <10ms
- Memory usage: <50MB for 1M logs
- Buffer flush: Every 1 second or when >100 entries

## Branch Strategy
Create branch: `0004-log-management-tools`
Merge after all success criteria met and tests pass.