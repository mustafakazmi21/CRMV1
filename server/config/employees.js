// server/config/employees.js

module.exports = [
    {
        username: 'admin',
        passwordPlain: 'admin1234', // In DB, we will hash this
        role: 'ADMIN'
    },
    {
        username: 'employee',
        passwordPlain: 'employee1234', // In DB, we will hash this
        role: 'EMPLOYEE'
    }
];
