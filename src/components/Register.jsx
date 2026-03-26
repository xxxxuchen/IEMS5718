import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const Register = ({ onSwitch }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await register(email, password, confirmPassword);
    if (result.success) {
      setSuccess(true);
      setError("");
    } else {
      setError(result.error);
    }
  };

  if (success) {
    return (
      <div className="auth-form">
        <h2>Registration Successful!</h2>
        <p>You can now <a onClick={onSwitch}>login</a> with your credentials.</p>
      </div>
    );
  }

  return (
    <div className="auth-form">
      <h2>Register</h2>
      {error && <p className="error-msg">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <button type="submit">Register</button>
      </form>
      <p>
        Already have an account? <a onClick={onSwitch}>Login here</a>
      </p>
    </div>
  );
};

export default Register;
